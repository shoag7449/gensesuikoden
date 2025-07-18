
function extractFAT16file(imageArrayBuf, paths) {
    const view = new DataView(imageArrayBuf);
    const fatEntries = [];
    let bytesPerSector, sectorsPerCluster, reservedSectors;
    let numFATs, maxRootEntries, sectorsPerFAT;
    let rootOffset, rootSizeBytes, dataOffset, bytesPerCluster;

    if (!(() => {
        const PT = 0x1BE, SZ = 16, TYPES = [0x06, 0x0E];
        let partLBA = null;
        for (let i = 0; i < 4; i++) {
            const off = PT + i * SZ;
            if (TYPES.includes(view.getUint8(off + 4))) {
                partLBA = view.getUint32(off + 8, true);
                break;
            }
        }

        if (partLBA === null)
            return false;

        const BYTES = 512;
        const pOff = partLBA * BYTES;
        bytesPerSector = view.getUint16(pOff + 11, true);
        sectorsPerCluster = view.getUint8(pOff + 13);
        reservedSectors = view.getUint16(pOff + 14, true);
        numFATs = view.getUint8(pOff + 16);
        maxRootEntries = view.getUint16(pOff + 17, true);
        sectorsPerFAT = view.getUint16(pOff + 22, true);

        const rootSects = Math.ceil(maxRootEntries * 32 / bytesPerSector);
        const fatBytes = numFATs * sectorsPerFAT * bytesPerSector;
        rootOffset = pOff + reservedSectors * bytesPerSector + fatBytes;
        rootSizeBytes = rootSects * bytesPerSector;
        dataOffset = rootOffset + rootSizeBytes;
        bytesPerCluster = bytesPerSector * sectorsPerCluster;

        const total = sectorsPerFAT * bytesPerSector / 2;
        const fatStart = pOff + reservedSectors * bytesPerSector;
        for (let i = 0; i < total; i++) {
            fatEntries[i] = view.getUint16(fatStart + i * 2, true);
        }
        
        return true;
    })())
        return;

    function extractByPath(rawPath) {
        const segments = rawPath
            .replace(/^[\\/]+|[\\/]+$/g, '')
            .split(/[\\/]+/)
            .map(s => s.trim())
            .filter(s => s);
        let cluster = 0;

        for (let i = 0; i < segments.length; i++) {
            const name = segments[i].toUpperCase();
            const entries = parseEntries(cluster);
            const found = entries.find(e => e.name.toUpperCase() === name);
            if (!found) {
                return;
            }

            const isDir = !!(found.attr & 0x10);
            if (i < segments.length - 1) {
                if (!isDir)
                    return;
                cluster = found.firstClus;
            } else {
                if (isDir)
                    return;

                return extractFile(found.firstClus, found.size, found.name);
            }
        }
    }

    function parseEntries(firstClus) {
        const blocks = [];

        if (firstClus === 0) {
            blocks.push(new Uint8Array(imageArrayBuf, rootOffset, rootSizeBytes));
        } else {
            let c = firstClus;
            while (c < 0xFFF8) {
                const off = dataOffset + (c - 2) * bytesPerCluster;
                blocks.push(new Uint8Array(imageArrayBuf, off, bytesPerCluster));
                c = fatEntries[c];
            }
        }

        const totalLen = blocks.reduce((s, b) => s + b.length, 0);
        const raw = new Uint8Array(totalLen);
        let ptr = 0;
        blocks.forEach(b => { raw.set(b, ptr); ptr += b.length; });

        const dv = new DataView(raw.buffer);
        const entries = [];
        for (let i = 0; i < raw.length; i += 32) {
            const b0 = dv.getUint8(i);
            if (b0 === 0x00) break;
            if (b0 === 0xE5) continue;
            const attr = dv.getUint8(i + 11);
            if (attr === 0x0F) continue;

            let n = '';
            for (let j = 0; j < 8; j++) {
                const c = dv.getUint8(i + j);
                if (c !== 0x20) n += String.fromCharCode(c);
            }
            n = n.trim();
            let ext = '';
            for (let j = 0; j < 3; j++) {
                const c = dv.getUint8(i + 8 + j);
                if (c !== 0x20) ext += String.fromCharCode(c);
            }
            ext = ext.trim();
            if (ext) n += '.' + ext;

            const fc = dv.getUint16(i + 26, true);
            const sz = dv.getUint32(i + 28, true);
            entries.push({ name: n, attr, firstClus: fc, size: sz });
        }
        return entries;
    }

    function extractFile(firstClus, size, filename) {
        const chain = [];
        let c = firstClus;
        while (c < 0xFFF8) {
            chain.push(c);
            c = fatEntries[c];
        }

        const fileBuf = new Uint8Array(size);
        let p = 0;
        chain.forEach(cl => {
            const off = dataOffset + (cl - 2) * bytesPerCluster;
            const chunk = new Uint8Array(imageArrayBuf, off, bytesPerCluster);
            const len = Math.min(chunk.length, size - p);
            fileBuf.set(chunk.subarray(0, len), p);
            p += len;
        });

        return [filename, fileBuf];
    }

    const save = [];

    paths.forEach(e => {
        const c = extractByPath(e);
        if (c)
            save.push(c);
    });

    return save;
}