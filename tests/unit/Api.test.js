/** @jest-environment jsdom */
import {
	Context, StateContext, State, Computed, NotState,
	GenStateNode, GenStateComponent, GenStateTextNode, GenStateNodeSet,
	useState, useComputed, watch, normalizeCtxChild, normalizeCtxProps, $, t
} from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

describe('APIユーティリティ', () => {
	describe('$', () => {
		it('タグ名からGenStateDomNodeを生成する', () => {
			const gen = $('div');
			expect(gen).toBeInstanceOf(GenStateNode);
			expect(gen).not.toBeInstanceOf(GenStateComponent);
		});

		it('関数からGenStateComponentを生成する', () => {
			function Comp(ctx) { return $('div'); }
			expect($(Comp)).toBeInstanceOf(GenStateComponent);
		});

		it('propsを省略してchildrenを直接指定できる', () => {
			const ctx = new Context(window);
			const { element } = $('div', [$('p', ['x'])]).build(ctx);
			expect(element.outerHTML).toBe('<div><p>x</p></div>');
		});

		it('propsとchildrenの両方を指定できる', () => {
			const ctx = new Context(window);
			const { element } = $('div', { id: 'a' }, [$('p', ['x'])]).build(ctx);
			expect(element.outerHTML).toBe('<div id="a"><p>x</p></div>');
		});
	});

	describe('t', () => {
		it('状態変数を含まない場合は文字列を返す', () => {
			expect(t`plain ${1} and ${'str'}`).toBe('plain 1 and str');
		});

		it('状態変数を含む場合はComputedを返す', () => {
			const ctx = new StateContext();
			const state = new State(ctx, 10);
			const result = t`value is ${state}`;
			expect(result).toBeInstanceOf(Computed);
			expect(result.value).toBe('value is 10');

			state.value = 20;
			expect(result.value).toBe('value is 20');
		});

		it('NotStateは値として即時展開される', () => {
			expect(t`v=${new NotState(5)}`).toBe('v=5');
		});
	});

	describe('useState/useComputed', () => {
		it('ContextとStateContextのどちらでも宣言できる', () => {
			const ctx = new Context(window);
			const s1 = useState(ctx, 1);
			const s2 = useState(ctx.state, 2);
			expect(s1.ctx).toBe(ctx.state);
			expect(s2.ctx).toBe(ctx.state);

			const c1 = useComputed(ctx, () => s1.value + s2.value);
			expect(c1.value).toBe(3);
		});
	});

	describe('normalizeCtxChild', () => {
		it('文字列と状態変数はGenStateTextNodeへ正規化される', () => {
			const ctx = new StateContext();
			const state = new State(ctx, 'x');
			const result = normalizeCtxChild(['plain', state, $('div')]);
			expect(result[0]).toBeInstanceOf(GenStateTextNode);
			expect(result[1]).toBeInstanceOf(GenStateTextNode);
			expect(result[2]).toBeInstanceOf(GenStateNode);
			expect(result[2]).not.toBeInstanceOf(GenStateTextNode);
		});

		it('GenStateNodeSetはそのまま保持される', () => {
			const set = new GenStateNodeSet([]);
			const result = normalizeCtxChild([set]);
			expect(result[0]).toBe(set);
		});
	});

	describe('normalizeCtxProps', () => {
		function Comp(ctx, props) { return $('div'); }
		Comp.propTypes = {
			num: 1,
			str: 'default'
		};

		it('プロパティはIStateへ正規化される', () => {
			const ctx = new StateContext();
			const state = new State(ctx, 100);
			const props = normalizeCtxProps(Comp, { num: state, str: 'given' });
			expect(props.num).toBe(state);
			expect(props.str).toBeInstanceOf(NotState);
			expect(props.str.value).toBe('given');
		});

		it('省略時はpropTypesのデフォルト値が採用される', () => {
			const props = normalizeCtxProps(Comp, {});
			expect(props.num.value).toBe(1);
			expect(props.str.value).toBe('default');
		});
	});
});
