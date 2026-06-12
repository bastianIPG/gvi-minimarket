const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const sourcePath = path.join(buildDir, 'icon-source-f1.png');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function resize(source, targetSize) {
    const output = new PNG({ width: targetSize, height: targetSize });
    const xRatio = source.width / targetSize;
    const yRatio = source.height / targetSize;

    for (let y = 0; y < targetSize; y++) {
        for (let x = 0; x < targetSize; x++) {
            const sx = (x + 0.5) * xRatio - 0.5;
            const sy = (y + 0.5) * yRatio - 0.5;
            const x0 = Math.max(0, Math.floor(sx));
            const y0 = Math.max(0, Math.floor(sy));
            const x1 = Math.min(source.width - 1, x0 + 1);
            const y1 = Math.min(source.height - 1, y0 + 1);
            const tx = sx - x0;
            const ty = sy - y0;

            const offset = (y * targetSize + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
                const p00 = source.data[(y0 * source.width + x0) * 4 + channel];
                const p10 = source.data[(y0 * source.width + x1) * 4 + channel];
                const p01 = source.data[(y1 * source.width + x0) * 4 + channel];
                const p11 = source.data[(y1 * source.width + x1) * 4 + channel];
                const top = p00 + (p10 - p00) * tx;
                const bottom = p01 + (p11 - p01) * tx;
                output.data[offset + channel] = Math.round(top + (bottom - top) * ty);
            }
        }
    }

    return PNG.sync.write(output);
}

function makeIco(images) {
    let offset = 6 + images.length * 16;
    const header = Buffer.alloc(offset);
    let cursor = 0;

    header.writeUInt16LE(0, cursor);
    cursor += 2;
    header.writeUInt16LE(1, cursor);
    cursor += 2;
    header.writeUInt16LE(images.length, cursor);
    cursor += 2;

    for (const image of images) {
        header[cursor++] = image.size === 256 ? 0 : image.size;
        header[cursor++] = image.size === 256 ? 0 : image.size;
        header[cursor++] = 0;
        header[cursor++] = 0;
        header.writeUInt16LE(1, cursor);
        cursor += 2;
        header.writeUInt16LE(32, cursor);
        cursor += 2;
        header.writeUInt32LE(image.buffer.length, cursor);
        cursor += 4;
        header.writeUInt32LE(offset, cursor);
        cursor += 4;
        offset += image.buffer.length;
    }

    return Buffer.concat([header, ...images.map(image => image.buffer)]);
}

if (!fs.existsSync(sourcePath)) {
    throw new Error(`No se encontro ${sourcePath}. Este archivo es la fuente aprobada del logo F1.`);
}

fs.mkdirSync(buildDir, { recursive: true });

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const images = sizes.map(size => ({ size, buffer: resize(source, size) }));
const iconPng = images.find(image => image.size === 256).buffer;
const previewPng = images.find(image => image.size === 32).buffer;
const sourceBase64 = fs.readFileSync(sourcePath).toString('base64');

fs.writeFileSync(path.join(buildDir, 'icon.png'), iconPng);
fs.writeFileSync(path.join(buildDir, 'exe-icon-preview.png'), previewPng);
fs.writeFileSync(path.join(buildDir, 'installed-exe-icon-preview.png'), previewPng);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), makeIco(images));
fs.writeFileSync(
    path.join(buildDir, 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}"><image width="${source.width}" height="${source.height}" href="data:image/png;base64,${sourceBase64}"/></svg>\n`
);

console.log('Iconos F1 generados en build/icon.png y build/icon.ico');
