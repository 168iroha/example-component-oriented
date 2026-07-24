/** @jest-environment jsdom */
import { Context, StateAsyncComponent, useState, $, t } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

/** マイクロタスク経由のDOM更新の完了を待機する */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('StateAsyncComponent', () => {
	it('非同期コンポーネントはplaceholderが表示された後に置き換わる', async () => {
		async function AsyncComp(ctx) {
			await tick();
			return $('p', ['loaded']);
		}
		document.body.innerHTML = '<div id="app"></div>';
		$('div', [$(AsyncComp)]).mount(document.getElementById('app'));

		// 構築直後はplaceholder(空のTextノード)のみ
		expect(document.querySelector('#app p')).toBe(null);
		// 非同期処理の完了後はノードが存在する
		await tick();
		expect(document.querySelector('#app p').textContent).toBe('loaded');
	});

	it('非同期コンポーネントにもプロパティが渡される', async () => {
		async function AsyncComp(ctx, props) {
			await tick();
			return $('p', [t`v=${props.v}`]);
		}
		AsyncComp.propTypes = {
			v: 0
		};
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		const v = useState(ctx, 42);
		$('div', [$(AsyncComp, { v })]).mount(document.getElementById('app'), ctx);
		await tick();
		expect(document.querySelector('#app p').textContent).toBe('v=42');
	});

	it('ref({ node })によりStateAsyncComponentを参照できfinishedで完了を待機できる', async () => {
		async function AsyncComp(ctx) {
			await tick();
			return $('p', ['done']);
		}
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		const node = useState(ctx, undefined);
		$('div', [$(AsyncComp).ref({ node })]).mount(document.getElementById('app'), ctx);
		expect(node.org).toBeInstanceOf(StateAsyncComponent);

		await node.org.finished;
		await tick();
		expect(document.querySelector('#app p').textContent).toBe('done');
	});

	it('writeでは非同期コンポーネントは評価されずplaceholderとなる', async () => {
		let evaluated = false;
		async function AsyncComp(ctx) {
			evaluated = true;
			return $('p', ['async']);
		}
		function Main(ctx) {
			return $('div', [$(AsyncComp)]);
		}
		document.body.innerHTML = '<div id="app"></div>';
		await $(Main).write(document.getElementById('app'));
		// SSR時に副作用として非同期コンポーネントが構築されることを防止する
		expect(evaluated).toBe(false);
		expect(document.querySelector('#app p')).toBe(null);
	});
});
