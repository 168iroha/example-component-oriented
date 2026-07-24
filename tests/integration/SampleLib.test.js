/** @jest-environment jsdom */
import { Context, useState, $, t } from "../../src/core.js";
import { Choose, When } from "../../sample/lib/Choose.js";
import { ForEach } from "../../sample/lib/ForEach.js";
import { describe, it, expect } from '@jest/globals';

/** マイクロタスク経由のDOM更新の完了を待機する */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('sample/libとの結合', () => {
	describe('Choose/When', () => {
		function Main(ctx, props) {
			const cnt = useState(ctx, 0);
			return $('div', [
				$('button', { onclick: () => ++cnt.value }, ['inc']),
				$('div', { id: 'result' }, [
					$(Choose, { target: cnt }, [
						$(When, { test: v => v % 2 === 0 }, () => [t`even`]),
						$(When, () => [t`odd`])
					])
				])
			]);
		}

		it('条件に応じたノードが表示され、状態の変更で切り替わる', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			$(Main).mount(document.getElementById('app'));
			await tick();
			const result = document.getElementById('result');
			expect(result.textContent).toBe('even');

			document.querySelector('button').click();
			await tick();
			expect(result.textContent).toBe('odd');

			document.querySelector('button').click();
			await tick();
			expect(result.textContent).toBe('even');
		});
	});

	describe('ForEach', () => {
		it('リスト要素がレンダリングされ、リストの更新へ追従する', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const list = useState(ctx, [
				{ id: 0, val: 'item 1' },
				{ id: 1, val: 'item 2' },
				{ id: 2, val: 'item 3' }
			]);
			function Comp(ctx) {
				return $('div', [
					$('ul', [
						$(ForEach, { target: list, key: v => v.id }, item => [$('li', [item.val])])
					])
				]);
			}
			$(Comp).mount(document.getElementById('app'), ctx);
			await tick();
			expect([...document.querySelectorAll('li')].map(e => e.textContent)).toStrictEqual(['item 1', 'item 2', 'item 3']);

			// 追加
			list.value = [...list.value, { id: 3, val: 'item 4' }];
			await tick();
			expect([...document.querySelectorAll('li')].map(e => e.textContent)).toStrictEqual(['item 1', 'item 2', 'item 3', 'item 4']);

			// 削除と並び替え(key単位でノードが再利用される)
			const li2 = [...document.querySelectorAll('li')][1];
			list.value = [list.value[3], list.value[1]];
			await tick();
			expect([...document.querySelectorAll('li')].map(e => e.textContent)).toStrictEqual(['item 4', 'item 2']);
			expect([...document.querySelectorAll('li')][1]).toBe(li2);
		});
	});
});
