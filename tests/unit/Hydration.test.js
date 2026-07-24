/** @jest-environment jsdom */
import { Context, useState, $, t, html } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

/** マイクロタスク経由のDOM更新の完了を待機する */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ハイドレーション', () => {
	describe('mountによるDOMノードの比較・マージ', () => {
		it('既存のDOMノードと一致する構造をマウントできる', () => {
			document.body.innerHTML = '<div id="app"><p>a</p><p>b</p></div>';
			const ctx = new Context(window);
			const beforeP = document.querySelector('#app p');
			$('div', [$('p', ['a']), $('p', ['b'])]).mount(document.getElementById('app'), ctx);
			// 既存のDOMノードが再利用される
			expect(document.querySelector('#app p')).toBe(beforeP);
			expect(document.querySelectorAll('#app p').length).toBe(2);
		});

		it('タグ名が異なる場合は例外となる', () => {
			document.body.innerHTML = '<div id="app"><span>a</span></div>';
			const ctx = new Context(window);
			expect(() => $('div', [$('p', ['a'])]).mount(document.getElementById('app'), ctx)).toThrow(/different tag names/);
		});

		it('既存のノードが不足している場合は例外となる', () => {
			document.body.innerHTML = '<div id="app"><p>a</p></div>';
			const ctx = new Context(window);
			expect(() => $('div', [$('p', ['a']), $('p', ['b'])]).mount(document.getElementById('app'), ctx)).toThrow('The number of nodes is insufficient.');
		});

		it('既存のノードが過剰な場合は例外となる', () => {
			// 1つだけ過剰なケース(過去にoff-by-oneで検出されなかった回帰テスト)
			document.body.innerHTML = '<div id="app"><p>a</p><p>b</p></div>';
			const ctx = new Context(window);
			expect(() => $('div', [$('p', ['a'])]).mount(document.getElementById('app'), ctx)).toThrow('The number of nodes is excessive.');
		});

		it('テキストノードはハイドレーション時に補完される', () => {
			// 既存のDOMにはテキストノードが存在しなくても構築される
			document.body.innerHTML = '<div id="app"><p>x</p><p>y</p></div>';
			const ctx = new Context(window);
			$('div', [$('p', ['x']), 'mid', $('p', ['y'])]).mount(document.getElementById('app'), ctx);
			expect(document.getElementById('app').innerHTML).toBe('<p>x</p>mid<p>y</p>');
		});
	});

	describe('write→mountの往復(SSR相当)', () => {
		function CountButton(ctx, props, children) {
			return $('div', [
				$('button', { onclick: () => props.onclick.value() }, children),
			]);
		}
		CountButton.propTypes = {
			onclick: () => {}
		};

		function Main(ctx) {
			const cnt = useState(ctx, 0);
			return $('div', [
				$(CountButton, { onclick: () => ++cnt.value }, [t`Count is: ${cnt}`]),
				$('hr'),
				t`tail: ${cnt}`,
				'static-tail'
			]);
		}

		it('writeで構築したHTMLを再パースしてmountできる', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			await $(Main).write(document.getElementById('app'));
			const ssrHtml = document.getElementById('app').outerHTML;
			expect(ssrHtml).toBe('<div id="app"><div><button>Count is: 0</button></div><hr>tail: 0static-tail</div>');

			// ブラウザによる再パースを模擬してハイドレーション
			document.body.innerHTML = ssrHtml;
			const app = document.getElementById('app');
			$(Main).mount(app);
			expect(app.outerHTML).toBe(ssrHtml);

			// ハイドレーション後はイベントが機能する
			app.querySelector('button').click();
			await tick();
			expect(app.querySelector('button').textContent).toBe('Count is: 1');
		});

		it('writeでは状態変数の変更の伝播が破棄される', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const cnt = useState(ctx, 0);
			let sideEffect = 0;
			function Comp(c) {
				c.onMount(() => ++sideEffect);
				return $('div', [t`${cnt}`]);
			}
			await $(Comp).write(document.getElementById('app'), ctx);
			// write時はonMountのような副作用は発火しない
			expect(sideEffect).toBe(0);
		});
	});

	describe('GenStateHTMLElement', () => {
		it('html()で既存のHTMLElementをノードツリーへ組み込める', () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const raw = document.createElement('span');
			raw.textContent = 'raw';
			$('div', [html(raw)]).mount(document.getElementById('app'), ctx);
			expect(document.querySelector('#app span').textContent).toBe('raw');
		});

		it('マウント対象がある場合は属性がマージされる', () => {
			document.body.innerHTML = '<div id="app"><span class="exist">x</span></div>';
			const ctx = new Context(window);
			const raw = document.createElement('span');
			raw.setAttribute('data-add', '1');
			raw.setAttribute('class', 'ignored');
			$('div', [html(raw)]).mount(document.getElementById('app'), ctx);
			const span = document.querySelector('#app span');
			// 既存の属性が優先されつつ存在しない属性は移動される
			expect(span.getAttribute('class')).toBe('exist');
			expect(span.getAttribute('data-add')).toBe('1');
		});
	});
});
