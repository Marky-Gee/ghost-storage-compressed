# Ghost Storage Compressed

![npm](https://img.shields.io/npm/dt/ghost-storage-compressed.svg)

Ghost Storage compressed allows ghost to compress your images when saving locally

Supports : imagemin-giflossy, imagemin-gifsicle, imagemin-jpegtran, imagemin-mozjpeg, imagemin-optipng, imagemin-pngquant, imagemin-webp

## Installation

Via NPM

```
npm install ghost-storage-compressed
mkdir -p ./content/adapters/storage
cp -r ./node_modules/ghost-storage-compressed ./content/adapters/storage/compressed
```

Via GIT

```
mkdir -p ./content/adapters/storage/compressed
cd content/adapters/storage/compressed
git clone git@github.com:marky-gee/ghost-storage-compressed.git .
npm install
```

## Configuration

Add this in `config."GHOST_ENVIRONMENT".js` file

```
"storage": {
    "active": "compressed",
    "compressed": {
        "PLUGIN_NAME":{
            "active":true,
            "pluginOption":"value"
        }
    }
}
```

Example config

```
"storage": {
    "active": "compressed",
    "compressed": {
        "mozjpeg": {
            "active": true,
        },
        "pngquant": {
            "active": true,
            "quality": [0.8,0.95]
        }
    }
}
```
