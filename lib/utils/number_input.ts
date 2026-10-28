// 数字の入力欄で、数字以外は受け付けない（2026-10-28 オーナー指摘: 「5回」「100kg」が先頭の数字として保存されていた）。
// 全角の数字は半角に直す
export const toIntegerInput = (v: string) => v.normalize('NFKC').replace(/[^0-9]/g, '')
// 小数点は1つまで
export const toDecimalInput = (v: string) => v.normalize('NFKC').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
