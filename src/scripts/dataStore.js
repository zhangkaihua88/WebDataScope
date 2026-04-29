(() => {
    const DB_NAME = 'WQP_Extension_Data_Files';
    const DB_VERSION = 1;
    const FILE_STORE = 'files';
    const META_STORE = 'meta';
    const REQUIRED_FILES = ['dataSetList.json', 'oth/info_data.bin'];

    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function transactionDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(FILE_STORE)) {
                    db.createObjectStore(FILE_STORE, { keyPath: 'path' });
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function normalizeDataPath(path) {
        if (!path) return '';

        let normalized = String(path)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/\/+/g, '/');

        const parts = normalized.split('/').filter(Boolean);
        const dataIndex = parts.findIndex(part => part.toLowerCase() === 'data');
        if (dataIndex >= 0) {
            normalized = parts.slice(dataIndex + 1).join('/');
        } else {
            normalized = parts.join('/');
        }

        normalized = normalized.replace(/^data\//i, '');

        if (!normalized || normalized.endsWith('/')) return '';
        if (normalized.startsWith('__MACOSX/') || normalized.includes('/__MACOSX/')) return '';
        if (normalized.split('/').some(part => part === '.DS_Store' || part.startsWith('.'))) return '';

        return normalized;
    }

    function cloneArrayBuffer(buffer) {
        if (buffer instanceof ArrayBuffer) return buffer.slice(0);
        if (ArrayBuffer.isView(buffer)) {
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }
        return buffer;
    }

    async function getRecord(path) {
        const db = await openDB();
        try {
            const tx = db.transaction(FILE_STORE, 'readonly');
            const store = tx.objectStore(FILE_STORE);
            return await requestToPromise(store.get(normalizeDataPath(path)));
        } finally {
            db.close();
        }
    }

    async function getFileArrayBuffer(path) {
        const record = await getRecord(path);
        return record ? cloneArrayBuffer(record.data) : null;
    }

    async function getText(path) {
        const buffer = await getFileArrayBuffer(path);
        if (!buffer) return null;
        return new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    }

    async function getJson(path) {
        const text = await getText(path);
        return text ? JSON.parse(text) : null;
    }

    async function getMeta() {
        const db = await openDB();
        try {
            const tx = db.transaction(META_STORE, 'readonly');
            return await requestToPromise(tx.objectStore(META_STORE).get('importMeta'));
        } finally {
            db.close();
        }
    }

    async function replaceFiles(records, sourceName) {
        const db = await openDB();
        try {
            const tx = db.transaction([FILE_STORE, META_STORE], 'readwrite');
            const fileStore = tx.objectStore(FILE_STORE);
            const metaStore = tx.objectStore(META_STORE);
            const importedAt = new Date().toISOString();
            let totalBytes = 0;

            fileStore.clear();
            for (const record of records) {
                totalBytes += record.size;
                fileStore.put({
                    path: record.path,
                    data: cloneArrayBuffer(record.data),
                    size: record.size,
                    updatedAt: importedAt,
                });
            }

            const paths = records.map(record => record.path);
            const missingRequired = REQUIRED_FILES.filter(path => !paths.includes(path));
            const meta = {
                sourceName,
                importedAt,
                fileCount: records.length,
                totalBytes,
                missingRequired,
            };
            metaStore.put(meta, 'importMeta');
            await transactionDone(tx);
            return meta;
        } finally {
            db.close();
        }
    }

    async function importZip(file, options = {}) {
        const zipLib = globalThis.JSZip;
        if (!zipLib) {
            throw new Error('JSZip is not loaded');
        }

        const zip = await zipLib.loadAsync(file);
        const entries = Object.values(zip.files)
            .filter(entry => !entry.dir)
            .map(entry => ({ entry, path: normalizeDataPath(entry.name) }))
            .filter(item => item.path);

        if (!entries.length) {
            throw new Error('No data files found in zip');
        }

        const records = [];
        for (let index = 0; index < entries.length; index++) {
            const { entry, path } = entries[index];
            options.onProgress?.({
                current: index + 1,
                total: entries.length,
                path,
            });
            const data = await entry.async('arraybuffer');
            records.push({
                path,
                data,
                size: data.byteLength,
            });
        }

        const paths = records.map(record => record.path);
        const missingRequired = REQUIRED_FILES.filter(path => !paths.includes(path));
        if (missingRequired.length) {
            throw new Error(`Missing required data files: ${missingRequired.join(', ')}`);
        }

        return replaceFiles(records, file.name);
    }

    globalThis.WQPDataStore = {
        DB_NAME,
        FILE_STORE,
        META_STORE,
        normalizeDataPath,
        getFileArrayBuffer,
        getText,
        getJson,
        getMeta,
        importZip,
    };
})();
