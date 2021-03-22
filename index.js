const serveStatic = require("../../../../current/core/shared/express").static;
const fs = require("fs-extra");
const path = require("path");
const Promise = require("bluebird");
const moment = require("moment");
const config = require("../../../../current/core/shared/config");
const { i18n } = require("../../../../current/core/server/lib/common");
const logging = require("../../../../current/core/shared/logging");
const errors = require("@tryghost/errors");
const constants = require("@tryghost/constants");
const urlUtils = require("../../../../current/core/shared/url-utils");
const StorageBase = require("ghost-storage-base");

class CompressedAdapter extends StorageBase {
	constructor(options) {
		super(options);

		this.storagePath = config.getContentPath("images");
		const adapter = options || {};
		console.log(this.storagePath, adapter);

		let imageminPlugins = [];
		if (adapter.jpegtran && adapter.jpegtran.active) {
			const imageminJpegtran = require("imagemin-jpegtran");
			imageminPlugins.push(imageminJpegtran(adapter.jpegtran));
		}
		if (adapter.mozjpeg && adapter.mozjpeg.active) {
			const imageminMozjpeg = require("imagemin-mozjpeg");
			imageminPlugins.push(imageminMozjpeg(adapter.mozjpeg));
		}
		if (adapter.pngquant && adapter.pngquant.active) {
			const imageminPngquant = require("imagemin-pngquant");
			imageminPlugins.push(imageminPngquant(adapter.pngquant));
		}
		if (adapter.imageminOptipng && adapter.imageminOptipng.active) {
			const imageminOptipng = require("imagemin-optipng");
			imageminPlugins.push(imageminOptipng(adapter.imageminOptipng));
		}
		if (adapter.gifsicle && adapter.gifsicle.active) {
			const imageminGifsicle = require("imagemin-gifsicle");
			imageminPlugins.push(imageminGifsicle(adapter.gifsicle));
		}
		if (adapter.giflossy && adapter.giflossy.active) {
			const imageminGiflossy = require("imagemin-giflossy");
			imageminPlugins.push(imageminGiflossy(adapter.giflossy));
		}
		if (adapter.webp && adapter.webp.active) {
			const imageminWebp = require("imagemin-webp");
			imageminPlugins.push(imageminWebp(adapter.webp));
		}
		this.imageminPlugins = imageminPlugins;
	}

	/**
	 * Saves a buffer in the targetPath
	 * - buffer is an instance of Buffer
	 * - returns a Promise which returns the full URL to retrieve the data
	 */
	saveRaw(buffer, targetPath) {
		console.log("saveRaw");
		const storagePath = path.join(this.storagePath, targetPath);
		const targetDir = path.dirname(storagePath);

		return fs
			.mkdirs(targetDir)
			.then(() => {
				return fs.writeFile(storagePath, buffer);
			})
			.then(() => {
				// For local file system storage can use relative path so add a slash
				const fullUrl = urlUtils
					.urlJoin(
						"/",
						urlUtils.getSubdir(),
						urlUtils.STATIC_IMAGE_URL_PREFIX,
						targetPath
					)
					.replace(new RegExp(`\\${path.sep}`, "g"), "/");

				return fullUrl;
			});
	}

	/**
	 * Saves the image to storage (the file system)
	 * - image is the express image object
	 * - returns a promise which ultimately returns the full url to the uploaded image
	 *
	 * @param image
	 * @param targetDir
	 * @returns {*}
	 */
	save(image, targetDir) {
		// console.log("save", image, targetDir);

		let targetFilename;

		// NOTE: the base implementation of `getTargetDir` returns the format this.storagePath/YYYY/MM
		targetDir = targetDir || this.getTargetDir(this.storagePath);

		return this.getUniqueFileName(image, targetDir)
			.then((filename) => {
				targetFilename = filename;
				return fs.mkdirs(targetDir);
			})
			.then(() => {
				const imagemin = require("imagemin");
				return (async () => {
					try {
						const imageminPlugins = this.imageminPlugins;
						console.log("imageminPlugins", imageminPlugins);
						const files = await imagemin([image.path], {
							plugins: imageminPlugins,
						});
						fs.writeFile(
							targetFilename,
							Buffer.from(files[0].data, "base64"),
							function (err) {
								if (err) console.log(err);
							}
						);
					} catch (error) {
						console.log(error);
					}
				})();
			})
			.then(() => {
				// The src for the image must be in URI format, not a file system path, which in Windows uses \
				// For local file system storage can use relative path so add a slash
				const fullUrl = urlUtils
					.urlJoin(
						"/",
						urlUtils.getSubdir(),
						urlUtils.STATIC_IMAGE_URL_PREFIX,
						path.relative(this.storagePath, targetFilename)
					)
					.replace(new RegExp(`\\${path.sep}`, "g"), "/");

				return fullUrl;
			})
			.catch((e) => {
				return Promise.reject(e);
			});
	}

	exists(fileName, targetDir) {
		const filePath = path.join(targetDir || this.storagePath, fileName);

		return fs
			.stat(filePath)
			.then(() => {
				return true;
			})
			.catch(() => {
				return false;
			});
	}

	/**
	 * For some reason send divides the max age number by 1000
	 * Fallthrough: false ensures that if an image isn't found, it automatically 404s
	 * Wrap server static errors
	 *
	 * @returns {serveStaticContent}
	 */
	serve() {
		const { storagePath } = this;

		return function serveStaticContent(req, res, next) {
			const startedAtMoment = moment();

			return serveStatic(storagePath, {
				maxAge: constants.ONE_YEAR_MS,
				fallthrough: false,
				onEnd: () => {
					logging.info(
						"LocalFileStorage.serve",
						req.path,
						moment().diff(startedAtMoment, "ms") + "ms"
					);
				},
			})(req, res, (err) => {
				if (err) {
					if (err.statusCode === 404) {
						return next(
							new errors.NotFoundError({
								message: i18n.t("errors.errors.imageNotFound"),
								code: "STATIC_FILE_NOT_FOUND",
								property: err.path,
							})
						);
					}

					if (err.statusCode === 400) {
						return next(new errors.BadRequestError({ err: err }));
					}

					if (err.statusCode === 403) {
						return next(new errors.NoPermissionError({ err: err }));
					}

					return next(new errors.GhostError({ err: err }));
				}

				next();
			});
		};
	}

	/**
	 * Not implemented.
	 * @returns {Promise.<*>}
	 */
	delete() {
		console.log("delete");
		return Promise.reject("not implemented");
	}

	/**
	 * Reads bytes from disk for a target image
	 * - path of target image (without content path!)
	 *
	 * @param options
	 */
	read(options) {
		console.log("read");
		options = options || {};

		// remove trailing slashes
		options.path = (options.path || "").replace(/\/$|\\$/, "");

		const targetPath = path.join(this.storagePath, options.path);

		return new Promise((resolve, reject) => {
			fs.readFile(targetPath, (err, bytes) => {
				if (err) {
					if (err.code === "ENOENT" || err.code === "ENOTDIR") {
						return reject(
							new errors.NotFoundError({
								err: err,
								message: i18n.t(
									"errors.errors.imageNotFoundWithRef",
									{ img: options.path }
								),
							})
						);
					}

					if (err.code === "ENAMETOOLONG") {
						return reject(new errors.BadRequestError({ err: err }));
					}

					if (err.code === "EACCES") {
						return reject(
							new errors.NoPermissionError({ err: err })
						);
					}

					return reject(
						new errors.GhostError({
							err: err,
							message: i18n.t("errors.errors.cannotReadImage", {
								img: options.path,
							}),
						})
					);
				}

				resolve(bytes);
			});
		});
	}
}

module.exports = CompressedAdapter;
