import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch } from './search'

test('ひらがなでカタカナの種目名に当たる', () => {
  assert.ok(matchesSearch('バーベルベンチプレス', 'べんち'))
  assert.ok(matchesSearch('バーベルベンチプレス', 'ばーべる'))
})

test('全角・半角、大文字・小文字、空白・中黒の違いを吸収する', () => {
  assert.ok(matchesSearch('EZバーカール', 'ez'))
  assert.ok(matchesSearch('EZバーカール', 'ｅｚ'))
  assert.ok(matchesSearch('ﾍﾞﾝﾁﾌﾟﾚｽ', 'ベンチ'))
  assert.ok(matchesSearch('ダンベル・フライ', 'ダンベル フライ'))
})

test('当たらない語・空の語', () => {
  assert.ok(!matchesSearch('バーベルベンチプレス', 'すくわっと'))
  assert.ok(matchesSearch('バーベルベンチプレス', '  '))
})
