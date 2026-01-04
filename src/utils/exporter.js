/**
 * Converts a Float32Array to a PNG download.
 */
export function exportFloat32AsPNG(data, width, height, filename = 'export.png') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const buf = imgData.data;

    for (let i = 0; i < data.length; i++) {
        let val = data[i];
        if (val < 0) val = 0;
        if (val > 1) val = 1;
        const v = Math.floor(val * 255);
        buf[i * 4 + 0] = v;
        buf[i * 4 + 1] = v;
        buf[i * 4 + 2] = v;
        buf[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}
