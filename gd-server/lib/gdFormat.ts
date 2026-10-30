// GD использует специальный формат для передачи данных:
// ключи и значения чередуются через :
// Пример: 1:PlayerName:2:100:3:50
export function encodeObject(data: Record<number, string | number>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}:${value}`)
    .join(':')
}

// Несколько объектов (например, список игроков) разделяются через |
export function encodeList(items: Record<number, string | number>[]): string {
  return items.map(encodeObject).join('|')
}
