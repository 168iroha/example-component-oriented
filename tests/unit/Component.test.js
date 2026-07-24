/** @jest-environment jsdom */
import { Context, StateSyncComponent, useState, useComputed, $, t } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

/** マイクロタスク経由のDOM更新の完了を待機する */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('StateComponent', () => {
	describe('コンポーネントの構築', () => {
		it('コンポーネントを構築できる', () => {
			function Hello(ctx) {
				return $('p', ['hello component']);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [$(Hello)]).mount(document.getElementById('app'));
			expect(document.querySelector('#app p').textContent).toBe('hello component');
		});

		it('ネストしたコンポーネントを構築できる', () => {
			function Inner(ctx) {
				return $('span', ['inner']);
			}
			function Outer(ctx) {
				return $('div', { id: 'outer' }, [$(Inner)]);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [$(Outer)]).mount(document.getElementById('app'));
			expect(document.querySelector('#outer span').textContent).toBe('inner');
		});

		it('コンポーネントをルートとしてmountできる', () => {
			function Root(ctx) {
				return $('div', [$('p', ['root'])]);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$(Root).mount(document.getElementById('app'));
			expect(document.getElementById('app').textContent).toBe('root');
		});
	});

	describe('プロパティ', () => {
		function Show(ctx, props) {
			return $('p', [t`v=${props.v}`]);
		}
		Show.propTypes = {
			v: 'default'
		};

		it('プロパティが渡される', () => {
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [$(Show, { v: 'given' })]).mount(document.getElementById('app'));
			expect(document.querySelector('p').textContent).toBe('v=given');
		});

		it('省略されたプロパティはpropTypesのデフォルト値が渡される', () => {
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [$(Show)]).mount(document.getElementById('app'));
			expect(document.querySelector('p').textContent).toBe('v=default');
		});

		it('状態変数のプロパティは単方向データとして同期する', async () => {
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const v = useState(ctx, 'first');
			$('div', [$(Show, { v })]).mount(document.getElementById('app'), ctx);
			const p = document.querySelector('p');
			expect(p.textContent).toBe('v=first');

			// 状態変数の更新をしてDOMの更新まで待機すれば更新される
			v.value = 'second';
			await tick();
			expect(p.textContent).toBe('v=second');
		});

		it('コンポーネント内でのプロパティの書き換えは親に伝播しない(単方向)', async () => {
			function Modifier(ctx, props) {
				// 受け取ったプロパティを書き換える
				props.v.value = 'modified';
				return $('p', [t`${props.v}`]);
			}
			Modifier.propTypes = { v: '' };

			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const v = useState(ctx, 'origin');
			$('div', [$(Modifier, { v })]).mount(document.getElementById('app'), ctx);

			// 親側の状態変数は変化しない
			await tick();
			expect(v.org).toBe('origin');
		});

		it('子要素が渡される', () => {
			function Wrap(ctx, props, children) {
				return $('div', { id: 'wrap' }, children);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [$(Wrap, [$('p', ['child'])])]).mount(document.getElementById('app'));
			expect(document.querySelector('#wrap p').textContent).toBe('child');
		});
	});

	describe('状態の公開と観測', () => {
		it('exposeStatesをobserve()で観測できる', async () => {
			function Input2(ctx) {
				const input1 = useState(ctx, 'a');
				const input2 = useState(ctx, 'b');
				return {
					node: $('div', [
						$('input', { id: 'i1', value: 'a' }).observe({ value: input1 }),
						$('input', { id: 'i2', value: 'b' }).observe({ value: input2 }),
					]),
					exposeStates: {
						value: t`${input1}+${input2}`
					}
				};
			}
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const value = useState(ctx, undefined);
			$('div', [
				$(Input2).observe({ value }),
				$('p', [t`${value}`])
			]).mount(document.getElementById('app'), ctx);
			const p = document.querySelector('p');

			// 初期値の伝播はマウント完了後の副作用の解放とマイクロタスクを経由する
			expect(p.textContent).toBe('undefined');
			await tick();
			expect(p.textContent).toBe('a+b');

			// コンポーネント内部の状態変化が観測側へ伝播する
			const i1 = document.getElementById('i1');
			i1.value = 'x';
			i1.dispatchEvent(new window.Event('input', { bubbles: true }));
			await tick();
			expect(p.textContent).toBe('x+b');
		});

		it('ref({ ctx, node })によりコンポーネントのコンテキストとノードを参照できる', () => {
			function Comp(ctx) {
				return $('p', { id: 'target' }, ['x']);
			}
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const compCtx = useState(ctx, undefined);
			const compNode = useState(ctx, undefined);
			$('div', [$(Comp).ref({ ctx: compCtx, node: compNode })]).mount(document.getElementById('app'), ctx);

			// ノードの構築により直接指定した対象のノード情報を参照できる
			expect(compCtx.org).toBeInstanceOf(Context);
			expect(compNode.org).toBeInstanceOf(StateSyncComponent);
			expect(compNode.org.element.id).toBe('target');
		});
	});

	describe('ライフサイクル', () => {
		it('onMountはコンポーネントの構築後に発火する', () => {
			const seq = [];
			function Inner(ctx) {
				ctx.onMount(() => seq.push('inner mount'));
				return $('span', ['inner']);
			}
			function Outer(ctx) {
				ctx.onMount(() => seq.push('outer mount'));
				return $('div', [$(Inner)]);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [$(Outer)]).mount(document.getElementById('app'));
			expect(seq).toStrictEqual(['outer mount', 'inner mount']);
		});

		it('onBeforeUpdate/onAfterUpdateはDOM更新の前後に発火する', async () => {
			const seq = [];
			function Comp(ctx, props) {
				ctx.onBeforeUpdate(() => seq.push('before'));
				ctx.onAfterUpdate(() => seq.push('after'));
				return $('p', [t`${props.v}`]);
			}
			Comp.propTypes = { v: 0 };

			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const v = useState(ctx, 0);
			$('div', [$(Comp, { v })]).mount(document.getElementById('app'), ctx);
			seq.length = 0;

			// 状態変数の更新でDOMノードの更新を発火する
			++v.value;
			await tick();
			expect(seq).toStrictEqual(['before', 'after']);
		});

		it('onUnmountはノードのremoveで発火する', () => {
			const seq = [];
			function Comp(ctx) {
				ctx.onUnmount(() => seq.push('unmount'));
				return $('p', ['x']);
			}
			document.body.innerHTML = '<div id="app"></div>';
			const ctx = new Context(window);
			const node = useState(ctx, undefined);
			$('div', [$(Comp).ref({ node })]).mount(document.getElementById('app'), ctx);
			expect(seq).toStrictEqual([]);

			// refで取得したノードを外部から削除してonUnmountを発火する
			node.org.remove();
			expect(seq).toStrictEqual(['unmount']);
			expect(document.querySelector('p')).toBe(null);
		});
	});

	describe('エラーハンドリング', () => {
		it('イベントリスナで発生した例外はonErrorCapturedで捕捉される', () => {
			const seq = [];
			function Thrower(ctx) {
				return $('button', { onclick: () => { throw new Error('boom'); } }, ['x']);
			}
			function Root(ctx) {
				ctx.onErrorCaptured(error => { seq.push(error.message); return false; });
				return $('div', [$(Thrower)]);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$(Root).mount(document.getElementById('app'));

			// エラーの発火は即時でキャプチャされる
			document.querySelector('button').click();
			expect(seq).toStrictEqual(['boom']);
		});

		it('falseを返すハンドラは親への伝播を抑止する', () => {
			const seq = [];
			function Thrower(ctx) {
				return $('button', { onclick: () => { throw new Error('boom'); } }, ['x']);
			}
			function Mid(ctx, props, children) {
				ctx.onErrorCaptured(error => { seq.push(`mid:${error.message}`); return false; });
				return $('div', children);
			}
			function Root(ctx) {
				ctx.onErrorCaptured(error => { seq.push(`root:${error.message}`); return false; });
				return $(Mid, [$(Thrower)]);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$(Root).mount(document.getElementById('app'));
			document.querySelector('button').click();
			// Midで捕捉されRootには伝播しない
			expect(seq).toStrictEqual(['mid:boom']);
		});

		it('false以外を返すハンドラは親へ伝播する', () => {
			const seq = [];
			function Thrower(ctx) {
				return $('button', { onclick: () => { throw new Error('boom'); } }, ['x']);
			}
			function Mid(ctx, props, children) {
				ctx.onErrorCaptured(error => { seq.push(`mid:${error.message}`); });
				return $('div', children);
			}
			function Root(ctx) {
				ctx.onErrorCaptured(error => { seq.push(`root:${error.message}`); return false; });
				return $(Mid, [$(Thrower)]);
			}
			document.body.innerHTML = '<div id="app"></div>';
			$(Root).mount(document.getElementById('app'));
			document.querySelector('button').click();
			expect(seq).toStrictEqual(['mid:boom', 'root:boom']);
		});

		it('コンポーネント構築中の例外はリスローされる', () => {
			function Broken(ctx) {
				throw new Error('build error');
			}
			document.body.innerHTML = '<div id="app"></div>';
			expect(() => $('div', [$(Broken)]).mount(document.getElementById('app'))).toThrow('build error');
		});
	});

	describe('擬似コンポーネント', () => {
		it('early=trueの関数は即時評価される', () => {
			let receivedProps = undefined;
			function Pseudo(props, children) {
				receivedProps = props;
				return $('p', ['pseudo']);
			}
			Pseudo.early = true;

			const gen = $(Pseudo, { a: 1 });
			// コンテキストを介さずに即時に評価されGenStateNodeが得られる
			expect(receivedProps).toStrictEqual({ a: 1 });
			document.body.innerHTML = '<div id="app"></div>';
			$('div', [gen]).mount(document.getElementById('app'));
			expect(document.querySelector('p').textContent).toBe('pseudo');
		});
	});
});
