/** @jest-environment jsdom */
import { StateContext, State, watch, CommonLabel, Context, StateComponent, NotState, Computed } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

describe('State', () => {
	describe('単一コンテキストにおける単一の状態変数', () => {
		it('初期値の確認', () => {
			const ctx = new StateContext();
			const state = new State(ctx, 100);
			const computed = new Computed(ctx, () => state.value * 2);

			// 初期値の確認
			expect(computed.value).toBe(200);
			// 算出プロパティが属するStateContextの確認
			expect(computed.ctx).toBe(ctx);
			// 算出プロパティの実体である状態変数の取得
			expect(computed.state.org).toBe(computed.value);
		});

		describe('値の更新の検知', () => {
			it('コンテキストをもたない場合は検知不可', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				const computed = new Computed(ctx, () => state.value * 2);
				expect(computed.value).toBe(0);

				// コンテキストをもたないため、computedの更新で呼び出されない関数
				(() => {
					seq.push({ idx: reactiveNotCall, state: computed.value });
				})();

				expect(seq).toStrictEqual([
					{ idx: reactiveNotCall, state: 0 },
				]);

				// 状態変数の更新の実行
				++state.value;
				expect(computed.value).toBe(2);

				expect(seq).toStrictEqual([
					{ idx: reactiveNotCall, state: 0 },
				]);
			});

			it('Computed.addによる検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				const computed = new Computed(ctx, () => state.value * 2);
				expect(computed.value).toBe(0);

				// computedが変更されたときに呼びだされる関数を設定
				const caller = {
					caller: () => {
						seq.push({ idx: reactiveCall, state: computed.value });
					}
				};
				computed.add(caller);
	
				expect(seq).toStrictEqual([]);

				// 状態変数の更新の実行
				++state.value;
				expect(computed.value).toBe(2);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 2 },
				]);

				// callerの削除後は監視は行われない
				computed.delete(caller);
				++state.value;
				expect(computed.value).toBe(4);
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 2 },
				]);
			});

			it('watchによる検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				const computed = new Computed(ctx, () => state.value * 2);
				expect(computed.value).toBe(0);

				// コンテキストを指定して状態変数の更新を観測する関数を設定
				let prevWatch = state.org;
				const caller = watch(ctx, computed, (prev, next) => {
					seq.push({ idx: reactiveCall, state: computed.value });
					// 更新前後の値の検証
					expect(prev).toBe(prevWatch);
					expect(next).toBe(computed.value);
					prevWatch = next;
				});

				expect(seq).toStrictEqual([]);

				// 状態変数の更新の実行
				++state.value;
				expect(computed.value).toBe(2);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 2 },
				]);

				// callerの削除後は監視は行われない
				computed.delete(caller);
				++state.value;
				expect(computed.value).toBe(4);
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 2 },
				]);
			});

			describe('検知の制御', () => {
				describe('ラベル設定', () => {
					it('CommonLabel', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new StateContext();
						const state = new State(ctx, 0);
						const label = new CommonLabel();
						const computed = new Computed(ctx, () => state.value * 2, label);
		
						// computedが変更されたときに呼びだされる関数を設定
						computed.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: computed.value });
							}
						});
			
						expect(seq).toStrictEqual([]);
		
						// 状態変数の更新の実行
						++state.value;
		
						// 状態変数の更新の検知は即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 2 },
						]);

						// 蓄積した更新の処理
						label.proc();

						// 評価済みのため変わらない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 2 },
						]);
					});

					it('DomUpdateLabel', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
						const computed = new Computed(ctx.state, () => state.value * 2, ctx.domUpdateLabel);
		
						// computedが変更されたときに呼びだされる関数を設定
						computed.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: computed.value });
							}
						});
			
						expect(seq).toStrictEqual([]);

						return new Promise((resolve, reject) => {
							// 状態変数の更新の実行
							++state.value;

							// 状態変数の更新は即時評価されない
							expect(seq).toStrictEqual([]);
			
							// 状態変数の更新の実行
							++state.value;

							// 状態変数の更新は即時評価されない
							expect(seq).toStrictEqual([]);

							queueMicrotask(() => {
								// マイクロタスク完了の契機で発火する
								// 何回更新が起こっても1つに集約される
								expect(seq).toStrictEqual([
									{ idx: reactiveCall, state: 4 },
								]);
								resolve();
							});
						});
					});

					it('コンポーネント外におけるSideEffectLabel', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
						const computed = new Computed(ctx.state, () => state.value * 2, ctx.sideEffectLabel);
		
						// computedが変更されたときに呼びだされる関数を設定
						computed.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: computed.value });
							}
						});

						expect(seq).toStrictEqual([]);
		
						// 状態変数の更新の実行
						++state.value;
		
						// 状態変数の更新の検知は即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 2 },
						]);

						// 蓄積した更新の処理
						ctx.sideEffectLabel.proc();

						// 評価済みのため変わらない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 2 },
						]);
					});

					it('コンポーネント内におけるSideEffectLabel', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx1 = new Context(window);
						const ctx2 = ctx1.generateContextForComponent(ctx => new StateComponent(ctx));
						const state = new State(ctx2.state, 0);
						const computed = new Computed(ctx2.state, () => state.value * 2, ctx2.sideEffectLabel);
		
						// computedが変更されたときに呼びだされる関数を設定
						computed.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: computed.value });
							}
						});

						expect(seq).toStrictEqual([]);
		
						// 状態変数の更新の実行
						++state.value;
			
						// 状態変数の更新の検知は即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 2 },
						]);

						// 蓄積した更新の処理
						ctx2.sideEffectLabel.proc();

						// 評価済みのため変わらない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 2 },
						]);
					});
				});
			});
		});
	});

	// describe('単一コンテキストにおける複数の状態変数', () => {

	// });

	// describe('複数コンテキストにおける単一の状態変数', () => {

	// });

	// describe('複数コンテキストにおける複数の状態変数', () => {

	// });

	it('単方向関連付け', () => {
		const ctx = new StateContext();
		const state1 = new State(ctx, 100);
		const computed = new Computed(ctx, () => state1.value * 2);

		// ctx上で単方向関連付けされたデータの作成
		const { state: state2, caller } = computed.unidirectional(ctx);

		// state2にcomputedの内容が反映されていることの確認
		expect(state2.org).toBe(200);
		expect(state2.ctx).toBe(ctx);

		// state1の更新時にstate2に同期されることの確認
		++state1.value;
		expect(computed.value).toBe(202);
		expect(state2.org).toBe(computed.value);

		// state2の更新時にstate1やcomputedに同期されないことの確認
		++(/** @type { State<number> } */(state2).value);
		expect(state1.org).toBe(101);
		expect(computed.value).toBe(202);
		expect(state2.org).toBe(203);

		// 単方向関連付けの削除をすると同期されないことの確認
		caller.states.forEach(state => state.delete(caller.caller));
		state1.value = 10;
		expect(state1.org).toBe(10);
		expect(computed.value).toBe(20);
		expect(state2.org).toBe(203);
	});

	describe('更新の観測', () => {
		// 実体は間接的参照によるState.observeを呼び出すだけであるため単一ケースのみ実施

		const reactiveNotCall = 0;
		const reactiveCall = 1;
		const referenceCall = 2;
		/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
		const seq = [];

		const ctx = new StateContext();
		const state1 = new State(ctx, 0);
		const computed = new Computed(ctx, () => state1.value * 2);

		// 状態変数に参照が発生したときに呼び出すハンドラの設定
		state1.onreference = state => {
			seq.push({ idx: referenceCall, state: state.org });
		};
		// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化される
		const { state: state2, caller } = computed.observe(ctx);

		expect(seq).toStrictEqual([]);

		// state2が変更されたときに呼びだされる関数を設定
		state2.add({ caller: () => {
			seq.push({ idx: reactiveCall, state: state2.org });
		}});

		// State.addの契機でstate1.onreferenceが発火する
		expect(state1.onreference).toBe(true);
		expect(seq).toStrictEqual([
			{ idx: referenceCall, state: 0 },
		]);

		// 状態変数の更新の実行
		++state2.value;

		expect(seq).toStrictEqual([
			{ idx: referenceCall, state: 0 },
			{ idx: reactiveCall, state: 1 },
		]);
	});
});
