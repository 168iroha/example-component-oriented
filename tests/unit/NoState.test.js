import { StateContext, NotState } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

describe('NoState', () => {
	it('初期値の確認', () => {
		const state = new NotState(100);

		// 初期値の確認
		expect(state.value).toBe(100);
		// 状態変数が属するStateContextの確認
		expect(state.ctx).toBe(undefined);
	});

	it('単方向関連付け', () => {
		const ctx = new StateContext();
		const state1 = new NotState(100);

		// ctx上で単方向関連付けされたデータの作成
		const { state: state2, caller } = state1.unidirectional(ctx);

		// state2はstate1の単なる複製であることの確認
		expect(state2.value).toBe(100);
		expect(state2.ctx).toBe(undefined);
		// state1は変更不可のためcallerは存在しない
		expect(caller).toBe(undefined);
	});

	it('更新の観測', () => {
		const ctx = new StateContext();
		const state1 = new NotState(100);

		// ctx上で単方向関連付けされたデータの作成
		const { state: state2, caller } = state1.observe(ctx);

		// state2はstate1の単なる複製であることの確認
		expect(state2.value).toBe(100);
		expect(state2.ctx).toBe(undefined);
		// state1は変更不可のためcallerは存在しない
		expect(caller).toBe(undefined);
	});
});
