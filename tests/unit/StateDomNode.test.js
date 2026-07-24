/** @jest-environment jsdom */
import { Context, useState, useComputed, $, t } from "../../src/core.js";
import { describe, it, expect, jest } from '@jest/globals';

/** マイクロタスク経由のDOM更新の完了を待機する */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('StateDomNode', () => {
	describe('DOMノードの構築', () => {
		it('タグと子要素からDOMノードを構築できる', () => {
			const ctx = new Context(window);
			const { element } = $('div', [
				$('p', ['hello']),
				$('span', ['world'])
			]).build(ctx);

			expect(element.tagName).toBe('DIV');
			expect(element.outerHTML).toBe('<div><p>hello</p><span>world</span></div>');
		});

		it('文字列の子要素はテキストノードとして扱われる', () => {
			const ctx = new Context(window);
			const { element } = $('p', ['plain text']).build(ctx);
			expect(element.textContent).toBe('plain text');
		});

		it('mountによりDOMノードが対象へ設置される', () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			$('div', [$('p', ['mounted'])]).mount(document.getElementById('app'), ctx);
			expect(document.querySelector('#app p').textContent).toBe('mounted');
		});
	});

	describe('プロパティの設定', () => {
		it('プロパティ・属性が設定される', () => {
			const ctx = new Context(window);
			const { element } = $('a', { id: 'link', href: 'https://example.com/', title: 't' }).build(ctx);
			expect(element.id).toBe('link');
			expect(element.href).toBe('https://example.com/');
			expect(element.title).toBe('t');
		});

		it('undefined/null/falseのプロパティは設定されない', () => {
			const ctx = new Context(window);
			const { element } = $('div', { id: undefined, title: null, hidden: false }).build(ctx);
			expect(element.hasAttribute('id')).toBe(false);
			expect(element.hasAttribute('title')).toBe(false);
			expect(element.hidden).toBe(false);
		});

		it('styleはオブジェクトで指定できる', () => {
			const ctx = new Context(window);
			const { element } = $('div', { style: { color: 'red', 'font-size': '12px' } }).build(ctx);
			expect(element.style.color).toBe('red');
			expect(element.style.fontSize).toBe('12px');
		});

		it('状態変数のプロパティはリアクティブに更新される', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const title = useState(ctx, 'before');
			$('div', [$('p', { id: 'x', title })]).mount(document.getElementById('app'), ctx);
			const element = document.getElementById('x');
			expect(element.title).toBe('before');

			// 状態変数の更新をしてDOMの更新まで待機すれば更新される
			title.value = 'after';
			await tick();
			expect(element.title).toBe('after');
		});

		it('styleは状態変数によりリアクティブに更新される', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const color = useState(ctx, 'red');
			$('div', [$('div', { id: 'x', style: { color } })]).mount(document.getElementById('app'), ctx);
			const element = document.getElementById('x');
			expect(element.style.color).toBe('red');

			// 状態変数の更新をしてDOMの更新まで待機すれば更新される
			color.value = 'blue';
			await tick();
			expect(element.style.color).toBe('blue');
		});

		it('イベントリスナが動作する', () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			let clicked = 0;
			$('div', [$('button', { onclick: () => ++clicked }, ['btn'])]).mount(document.getElementById('app'), ctx);
			document.querySelector('button').click();
			expect(clicked).toBe(1);
		});
	});

	describe('テキストの状態バインディング', () => {
		it('tによるテキストが状態変数と同期する', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const cnt = useState(ctx, 0);
			$('div', [$('p', [t`Count is: ${cnt}`])]).mount(document.getElementById('app'), ctx);
			const p = document.querySelector('#app p');
			expect(p.textContent).toBe('Count is: 0');

			++cnt.value;
			await tick();
			expect(p.textContent).toBe('Count is: 1');
		});

		it('算出プロパティもテキストへ反映される', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const cnt = useState(ctx, 1);
			const double = useComputed(ctx, () => cnt.value * 2);
			$('div', [$('p', [t`x2 = ${double}`])]).mount(document.getElementById('app'), ctx);
			const p = document.querySelector('#app p');
			expect(p.textContent).toBe('x2 = 2');

			cnt.value = 5;
			await tick();
			expect(p.textContent).toBe('x2 = 10');
		});

		it('同一マイクロタスク内の複数回の更新はまとめて反映される', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const cnt = useState(ctx, 0);
			$('div', [$('p', [t`${cnt}`])]).mount(document.getElementById('app'), ctx);
			const p = document.querySelector('#app p');

			++cnt.value;
			++cnt.value;
			++cnt.value;
			// 更新はマイクロタスクで一括処理されるため即時では反映されない
			expect(p.textContent).toBe('0');
			await tick();
			expect(p.textContent).toBe('3');
		});
	});

	describe('参照と観測', () => {
		it('ref()によりStateNodeを参照できる', () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const node = useState(ctx, undefined);
			$('div', [$('p', { id: 'x' }, ['x']).ref({ node })]).mount(document.getElementById('app'), ctx);
			expect(node.org.element.id).toBe('x');
		});

		it('getStateNode()によりStateNodeを取得できる', () => {
			const ctx = new Context(window);
			let captured = undefined;
			$('div').getStateNode(node => captured = node).build(ctx);
			expect(captured).not.toBe(undefined);
			expect(captured.element.tagName).toBe('DIV');
		});

		it('inputのvalueをobserveで観測できる', () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const value = useState(ctx, undefined);
			$('div', [
				$('input', { value: 'init' }).observe({ value }),
				// 参照が生じることで観測が確立する
				$('p', [t`${value}`])
			]).mount(document.getElementById('app'), ctx);
			const input = document.querySelector('input');
			expect(value.org).toBe('init');

			// inputイベントで状態変数へ伝播する
			input.value = 'changed';
			input.dispatchEvent(new window.Event('input', { bubbles: true }));
			expect(value.org).toBe('changed');
		});

		it('clientHeight/clientWidthをobserveで観測できる', () => {
			// jsdomにはResizeObserverが存在しないためスタブする
			global.ResizeObserver = class {
				constructor(callback) {}
				observe() {}
			};
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const clientHeight = useState(ctx, undefined);
			const clientWidth = useState(ctx, undefined);
			$('div', [
				$('div').observe({ clientHeight, clientWidth }),
				$('p', [t`${clientHeight}x${clientWidth}`])
			]).mount(document.getElementById('app'), ctx);
			// 参照の確立により初期値(jsdomでは0)が伝播する
			expect(clientHeight.org).toBe(0);
			expect(clientWidth.org).toBe(0);
		});

		it('観測を行うノードの2回以上の構築は禁止される', () => {
			const ctx = new Context(window);
			const value = useState(ctx, undefined);
			const gen = $('input').observe({ value });
			gen.build(ctx);
			expect(() => gen.build(ctx)).toThrow('The buildCurrent in GenStateDomNode must not be called more than twice.');
		});

		it('観測済みノードのobserve()はノードを複製する', () => {
			const ctx = new Context(window);
			const v1 = useState(ctx, undefined);
			const v2 = useState(ctx, undefined);
			const gen1 = $('input').observe({ value: v1 });
			const gen2 = gen1.observe({ value: v2 });
			expect(gen1).not.toBe(gen2);
		});
	});

	describe('冗長なDOM書き戻しの抑止(IME保護など)', () => {
		it('input.valueが既に同じ値なら再代入(setter呼び出し)を行わない', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const inputVal = useState(ctx, '');
			$('div', [
				$('input', { oninput: e => inputVal.value = e.target.value, value: inputVal })
			]).mount(document.getElementById('app'), ctx);

			const input = document.querySelector('input');
			const proto = Object.getPrototypeOf(input);
			const desc = Object.getOwnPropertyDescriptor(proto, 'value');
			const spy = jest.fn(desc.set);
			Object.defineProperty(proto, 'value', { ...desc, set: spy });
			try {
				// ネイティブ入力によりinput.valueは既に'a'へ変わっている状態を模擬する
				input.value = 'a';
				spy.mockClear();
				input.dispatchEvent(new window.Event('input', { bubbles: true }));
				await tick();

				// oninputでinputVal.value = 'a'が設定されリアクティブな更新が走るが、
				// element.valueは既に'a'のため冗長な書き戻しは発生しないはず
				expect(spy).not.toHaveBeenCalled();
			}
			finally {
				Object.defineProperty(proto, 'value', desc);
			}
		});

		it('値が実際に異なる場合は通常通り書き戻される', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const inputVal = useState(ctx, '');
			$('div', [$('input', { value: inputVal })]).mount(document.getElementById('app'), ctx);

			const input = document.querySelector('input');
			inputVal.value = 'changed by state';
			await tick();
			expect(input.value).toBe('changed by state');
		});

		it('checkedについても同一値なら再代入しない', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const checked = useState(ctx, true);
			$('div', [$('input', { type: 'checkbox', checked })]).mount(document.getElementById('app'), ctx);

			const input = document.querySelector('input');
			expect(input.checked).toBe(true);
			const proto = Object.getPrototypeOf(input);
			const desc = Object.getOwnPropertyDescriptor(proto, 'checked');
			const spy = jest.fn(desc.set);
			Object.defineProperty(proto, 'checked', { ...desc, set: spy });
			try {
				spy.mockClear();
				// 同じ値(true)への再設定は書き戻さない
				checked.value = true;
				await tick();
				expect(spy).not.toHaveBeenCalled();

				// 異なる値への変更は通常通り反映される
				checked.value = false;
				await tick();
				expect(spy).toHaveBeenCalled();
				expect(input.checked).toBe(false);
			}
			finally {
				Object.defineProperty(proto, 'checked', desc);
			}
		});
	});
});
