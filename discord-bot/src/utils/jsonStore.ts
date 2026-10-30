import fs from "node:fs";

// Атомарная запись JSON: пишем во временный файл и переименовываем поверх
// целевого (rename атомарен). Так краш посреди записи не оставит битый файл.
// Предыдущая валидная версия сохраняется в <file>.bak для восстановления.
export function writeJsonAtomic(file: string, data: unknown): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    if (fs.existsSync(file)) {
        try {
            fs.copyFileSync(file, `${file}.bak`);
        } catch {
            /* бэкап некритичен */
        }
    }
    fs.renameSync(tmp, file);
}

// Чтение JSON с восстановлением из <file>.bak, если основной файл повреждён.
// При полном провале возвращает fallback (а не молча теряет данные без попытки).
export function readJsonSafe<T>(file: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
    } catch {
        try {
            return JSON.parse(fs.readFileSync(`${file}.bak`, "utf-8")) as T;
        } catch {
            return fallback;
        }
    }
}
