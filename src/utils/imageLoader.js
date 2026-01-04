import * as GeoTIFF from 'geotiff';

/**
 * Loads an image file and returns a standardized object.
 * @param {File} file 
 * @returns {Promise<{width: number, height: number, channels: Float32Array[], originalDepth: number}>}
 */
export async function loadImage(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'tif' || ext === 'tiff' || file.type === 'image/tiff') {
        return loadTiff(file);
    } else if (ext === 'mrc') {
        return loadMrc(file);
    } else if (ext === 'smv') {
        return loadSmv(file);
    } else {
        return loadStandardImage(file);
    }
}

async function loadMrc(file) {
    const ab = await file.arrayBuffer();
    const dv = new DataView(ab);

    // MRC Header 
    const nx = dv.getInt32(0, true);
    const ny = dv.getInt32(4, true);
    const nz = dv.getInt32(8, true);
    const mode = dv.getInt32(12, true);

    // Check endianness - if nx is impossible, try big endian
    let littleEndian = true;
    if (nx < 0 || nx > 50000) {
        littleEndian = false;
    }

    const width = littleEndian ? nx : dv.getInt32(0, false);
    const height = littleEndian ? ny : dv.getInt32(4, false);
    const finalMode = littleEndian ? mode : dv.getInt32(12, false);

    const dataOffset = 1024; // Standard MRC header
    let typedArray;
    let bpp = 1;

    switch (finalMode) {
        case 0: typedArray = new Int8Array(ab, dataOffset); bpp = 1; break;
        case 1: typedArray = new Int16Array(ab, dataOffset); bpp = 2; break;
        case 2: typedArray = new Float32Array(ab, dataOffset); bpp = 4; break;
        case 6: typedArray = new Uint16Array(ab, dataOffset); bpp = 2; break;
        default: throw new Error(`Unsupported MRC mode: ${finalMode}`);
    }

    // Process first slice if 3D
    const size = width * height;
    const floatArr = new Float32Array(size);

    // Stats for normalization if needed, but usually we just normalize to max of type
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < size; i++) {
        const val = typedArray[i];
        if (val < min) min = val;
        if (val > max) max = val;
    }

    const range = max - min || 1;
    for (let i = 0; i < size; i++) {
        floatArr[i] = (typedArray[i] - min) / range;
    }

    return {
        width,
        height,
        channels: [floatArr],
        originalDepth: bpp * 8
    };
}

async function loadSmv(file) {
    const ab = await file.arrayBuffer();
    const txt = new TextDecoder().decode(ab.slice(0, 2048));

    const headerBytesMatch = txt.match(/HEADER_BYTES\s*=\s*(\d+)/);
    if (!headerBytesMatch) throw new Error("Invalid SMV header: missing HEADER_BYTES");
    const headerBytes = parseInt(headerBytesMatch[1]);

    const size1Match = txt.match(/SIZE1\s*=\s*(\d+)/);
    const size2Match = txt.match(/SIZE2\s*=\s*(\d+)/);
    if (!size1Match || !size2Match) throw new Error("Invalid SMV header: missing SIZE1 or SIZE2");

    const width = parseInt(size1Match[1]);
    const height = parseInt(size2Match[1]);
    const byteOrder = txt.includes("BYTE_ORDER=big_endian") ? false : true; // default little

    const dataOffset = headerBytes;
    const size = width * height;
    const rawData = new Uint16Array(ab, dataOffset, size);
    const floatArr = new Float32Array(size);

    // Normalize based on min/max of the data
    let min = 65535, max = 0;
    for (let i = 0; i < size; i++) {
        let val = rawData[i];
        if (!byteOrder) { // swap if big endian
            val = ((val & 0xFF) << 8) | (val >> 8);
        }
        if (val < min) min = val;
        if (val > max) max = val;
        floatArr[i] = val;
    }

    const range = max - min || 1;
    for (let i = 0; i < size; i++) {
        floatArr[i] = (floatArr[i] - min) / range;
    }

    return {
        width,
        height,
        channels: [floatArr],
        originalDepth: 16
    };
}

async function loadTiff(file) {
    const arrayBuffer = await file.arrayBuffer();
    try {
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const width = image.getWidth();
        const height = image.getHeight();

        const rasters = await image.readRasters();
        const channels = [];
        const is16Bit = (rasters[0] instanceof Uint16Array || rasters[0] instanceof Int16Array);
        const maxVal = is16Bit ? 65535 : 255; // Heuristic, might need reading BitsPerSample

        // Load all channels (usually 1 for gray, 3 for RGB, 4 for RGBA)
        // We normalize to 0..1 Float32
        for (let c = 0; c < rasters.length; c++) {
            const raw = rasters[c]; // TypedArray
            const floatArr = new Float32Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
                floatArr[i] = raw[i] / maxVal;
            }
            channels.push(floatArr);
        }

        return {
            width,
            height,
            channels,
            originalDepth: is16Bit ? 16 : 8
        };
    } catch (e) {
        console.error("TIFF Load Error", e);
        throw e;
    }
}

function loadStandardImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, width, height);
            const rgba = imgData.data;

            // Standard images are RGBA (4 channels)
            const r = new Float32Array(width * height);
            const g = new Float32Array(width * height);
            const b = new Float32Array(width * height);
            // We can ignore alpha or store it if needed. Let's ignore for spectral analysis usually.

            for (let i = 0; i < width * height; i++) {
                r[i] = rgba[i * 4] / 255.0;
                g[i] = rgba[i * 4 + 1] / 255.0;
                b[i] = rgba[i * 4 + 2] / 255.0;
            }

            resolve({
                width,
                height,
                channels: [r, g, b],
                originalDepth: 8
            });
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
