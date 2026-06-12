require("dotenv").config();

const HtmlWebpackPlugin = require("html-webpack-plugin");
const InlineChunkHtmlPlugin = require("react-dev-utils/InlineChunkHtmlPlugin");
const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const DEV_SERVER_PORT = 9000;
const PORT_API_TARGET =
	process.env.PORT_REGION === "us"
		? "https://api.us.getport.io"
		: "https://api.getport.io";

module.exports = (env, argv) => ({
	mode: argv.mode === "production" ? "production" : "development",

	entry: {
		ui: "./src/index.tsx",
	},

	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: {
					loader: "ts-loader",
					options: { transpileOnly: true },
				},
				exclude: /node_modules/,
			},
			{
				test: /\.css$/,
				use: [
					"style-loader",
					"css-loader",
					{
						loader: "postcss-loader",
						options: {
							postcssOptions: {
								plugins: [["postcss-preset-env", {}]],
							},
						},
					},
				],
			},
			{ test: /\.(png|jpg|gif|webp)$/, loader: "url-loader" },
			{
				test: /\.svg$/i,
				issuer: /\.[jt]sx?$/,
				use: [
					{ loader: "@svgr/webpack" },
					{
						loader: "url-loader",
						options: { limit: 8192, name: "[name].[hash:8].[ext]" },
					},
				],
			},
		],
	},

	optimization: {
		minimize: true,
		minimizer: [
			new TerserPlugin({
				terserOptions: {
					output: { ascii_only: true },
				},
			}),
		],
		usedExports: true,
		// Mermaid dynamically imports diagram modules; Port plugins are a single
		// index.html upload — extra chunks (e.g. 731.js) are not hosted on portwidgets.io.
		...(argv.mode === "production" && {
			splitChunks: false,
			runtimeChunk: false,
		}),
	},

	resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"] },

	output: {
		filename: "[name].js",
		path: path.resolve(__dirname, "dist"),
		publicPath: "",
	},

	plugins: [
		new webpack.DefinePlugin({
			"process.env.BASE_URL": JSON.stringify(process.env.BASE_URL ?? ""),
			"process.env.CARDS_DEFAULT_EXPANDED": JSON.stringify(
				process.env.CARDS_DEFAULT_EXPANDED ?? "true",
			),
			"process.env.NODE_ENV": JSON.stringify(
				argv.mode === "production" ? "production" : "development",
			),
			...(argv.mode !== "production" && {
				"process.env.PORT_DEV_TOKEN": JSON.stringify(
					process.env.PORT_DEV_TOKEN ?? "",
				),
				"process.env.PORT_CLIENT_ID": JSON.stringify(
					process.env.PORT_CLIENT_ID ?? "",
				),
				"process.env.PORT_CLIENT_SECRET": JSON.stringify(
					process.env.PORT_CLIENT_SECRET ?? "",
				),
				"process.env.PORT_DEV_API_BASE_URL": JSON.stringify(
					process.env.PORT_DEV_API_BASE_URL ?? "",
				),
				"process.env.PORT_DEV_ENTITY_IDENTIFIER": JSON.stringify(
					process.env.PORT_DEV_ENTITY_IDENTIFIER ?? "my-test-app",
				),
				"process.env.PORT_DEV_BLUEPRINT_ID": JSON.stringify(
					process.env.PORT_DEV_BLUEPRINT_ID ??
						process.env.BLUEPRINT_ID ??
						"application",
				),
			}),
		}),
		new HtmlWebpackPlugin({
			template: "./src/index.html",
			filename: "index.html",
			chunks: ["ui"],
			cache: false,
		}),
		new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/ui/]),
		// Fold async chunks (mermaid) into the entry bundle for single-file Port deploy.
		...(argv.mode === "production"
			? [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })]
			: []),
	],

	devServer: {
		compress: true,
		port: DEV_SERVER_PORT,
		static: { directory: path.join(__dirname, "dist") },
		proxy: [
			{
				context: ["/v1"],
				target: PORT_API_TARGET,
				changeOrigin: true,
				secure: true,
			},
		],
	},
});
