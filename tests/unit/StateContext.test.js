/** @jest-environment jsdom */
import { StateContext, State, Context, NotState } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

describe('StateContext', () => {
	describe('単一コンテキストにおける単一の状態変数', () => {

		describe('値の更新の検知', () => {
			it('StateContext.callによる検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				expect(state.org).toBe(0);

				// 初回およびstateが変更されたときに呼びだされる関数を設定
				const caller = {
					caller: () => {
						seq.push({ idx: reactiveCall, state: state.org });
						state.value;
					}
				};
				const captureList = ctx.call(caller);
				// stateをキャプチャしたことの確認
				expect(captureList.caller).toBe(caller);
				expect(captureList.states.length).toBe(1);
				expect(captureList.states[0]).toBe(state);
	
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 0 },
				]);

				// 状態変数の更新の実行
				++state.value;
				expect(state.org).toBe(1);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 0 },
					{ idx: reactiveCall, state: 1 },
				]);

				// callerの削除後は監視は行われない
				captureList.states.forEach(state => state.delete(captureList.caller));
				++state.value;
				expect(state.org).toBe(2);
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 0 },
					{ idx: reactiveCall, state: 1 },
				]);
			});

			describe('検知の制御', () => {
				describe('手動での検知', () => {
					it('ラベルなしのStateContext.update', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new StateContext();
						const state = new State(ctx, 0);
	
						expect(seq).toStrictEqual([]);

						// 手動での更新の発火
						// stateが変更されたときに呼びだされる関数を設定
						ctx.update([{
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							}
						}]);

						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 0 },
						]);
		
						// 状態変数の更新の実行
						++state.value;
		
						// 手動での発火はcaller内で状態変数を参照していても状態変数の更新は検知しない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 0 },
						]);
					});

					it('ラベルなしのStateContext.update2', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new StateContext();
						const state = new State(ctx, 0);
	
						expect(seq).toStrictEqual([]);

						// 手動での更新の発火
						ctx.update2([() => {
							seq.push({ idx: reactiveCall, state: state.org });
							state.value;
						}]);

						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 0 },
						]);
		
						// 状態変数の更新の実行
						++state.value;
		
						// 手動での発火はcaller内で状態変数を参照していても状態変数の更新は検知しない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 0 },
						]);
					});
				});

				describe('ロック', () => {
					it('ロック対象なし', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
	
						// 初期状態ではロックはかかっていない
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
	
						expect(seq).toStrictEqual([]);
	
						// Context.sideEffectLabelについてロックをかける
						ctx.state.lock([ctx.domUpdateLabel]);
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(true);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
	
						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
							// ロックしていないラベルを指定
							label: ctx.sideEffectLabel
						});
	
						expect(seq).toStrictEqual([]);

						// 状態変数の更新の実行
						++state.value;

						// ロックしていないため即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);

						// ロックを解除する
						const callback = ctx.state.unlock([ctx.domUpdateLabel]);
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);

						return new Promise((resolve, reject) => {
							callback();

							// callerは空のため何も起こらない
							expect(seq).toStrictEqual([
								{ idx: reactiveCall, state: 1 },
							]);
							queueMicrotask(() => {
								expect(seq).toStrictEqual([
									{ idx: reactiveCall, state: 1 },
								]);

								resolve();
							});
						});
					});

					it('State.Context.updateの実行によるロック対象あり', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
	
						// 初期状態ではロックはかかっていない
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
	
						expect(seq).toStrictEqual([]);
	
						// Context.sideEffectLabelについてロックをかける
						ctx.state.lock([ctx.domUpdateLabel]);
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(true);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
	
						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
							// ロックしているラベルを指定
							label: ctx.domUpdateLabel
						});
	
						expect(seq).toStrictEqual([]);
		
						return new Promise((resolve, reject) => {
							// 状態変数の更新の実行
							++state.value;
	
							// ロックをしているためcallerは発火されず蓄積される
							expect(seq).toStrictEqual([]);
							expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(1);
	
							queueMicrotask(() => {
								// ロックをしているためマイクロタスク完了を待っても発火されない
								expect(seq).toStrictEqual([]);
	
								// ロックを解除する
								const callback = ctx.state.unlock([ctx.domUpdateLabel]);
								expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
								expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
								expect(seq).toStrictEqual([]);
	
								// callbackの呼び出しタイミングでcallerがICallerLabelのルールに従って評価される
								callback();
								expect(seq).toStrictEqual([]);
								queueMicrotask(() => {
									// マイクロタスク完了の契機で発火する
									expect(seq).toStrictEqual([
										{ idx: reactiveCall, state: 1 },
									]);
	
									// もう一度callbackを呼び出すことでcallerが再度呼び出される
									callback();
									expect(seq).toStrictEqual([
										{ idx: reactiveCall, state: 1 },
									]);
									queueMicrotask(() => {
										// マイクロタスク完了の契機で発火する
										expect(seq).toStrictEqual([
											{ idx: reactiveCall, state: 1 },
											{ idx: reactiveCall, state: 1 },
										]);
	
										// 状態変数の更新の実行
										++state.value;
										queueMicrotask(() => {
											// ロックを解除したため通常通りcallerが評価される
											expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
											expect(seq).toStrictEqual([
												{ idx: reactiveCall, state: 1 },
												{ idx: reactiveCall, state: 1 },
												{ idx: reactiveCall, state: 2 },
											]);
		
											resolve();
										});
									});
								});
							});
						});
					});

					it('State.Context.update2直接実行によるロック対象あり', () => {
						//
						// 「State.Context.updateの実行によるロック対象あり」と全く同じ動作をすることを想定
						//

						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
	
						// 初期状態ではロックはかかっていない
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
	
						expect(seq).toStrictEqual([]);
	
						// Context.sideEffectLabelについてロックをかける
						ctx.state.lock([ctx.domUpdateLabel]);
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(true);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
	
						// stateが変更されたときに呼びだされる関数を設定
						const caller = () => {
							seq.push({ idx: reactiveCall, state: state.org });
						};
	
						expect(seq).toStrictEqual([]);
		
						return new Promise((resolve, reject) => {
							// StateContext.update2の直接実行
							++state.org;
							ctx.state.update2([caller], ctx.domUpdateLabel);
	
							// ロックをしているためcallerは発火されず蓄積される
							expect(seq).toStrictEqual([]);
							expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(1);
	
							queueMicrotask(() => {
								// ロックをしているためマイクロタスク完了を待っても発火されない
								expect(seq).toStrictEqual([]);
	
								// ロックを解除する
								const callback = ctx.state.unlock([ctx.domUpdateLabel]);
								expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
								expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
								expect(seq).toStrictEqual([]);
	
								// callbackの呼び出しタイミングでcallerがICallerLabelのルールに従って評価される
								callback();
								expect(seq).toStrictEqual([]);
								queueMicrotask(() => {
									// マイクロタスク完了の契機で発火する
									expect(seq).toStrictEqual([
										{ idx: reactiveCall, state: 1 },
									]);
	
									// もう一度callbackを呼び出すことでcallerが再度呼び出される
									callback();
									expect(seq).toStrictEqual([
										{ idx: reactiveCall, state: 1 },
									]);
									queueMicrotask(() => {
										// マイクロタスク完了の契機で発火する
										expect(seq).toStrictEqual([
											{ idx: reactiveCall, state: 1 },
											{ idx: reactiveCall, state: 1 },
										]);
	
										// StateContext.update2の直接実行
										++state.org;
										ctx.state.update2([caller], ctx.domUpdateLabel);
										queueMicrotask(() => {
											// ロックを解除したため通常通りcallerが評価される
											expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
											expect(seq).toStrictEqual([
												{ idx: reactiveCall, state: 1 },
												{ idx: reactiveCall, state: 1 },
												{ idx: reactiveCall, state: 2 },
											]);
		
											resolve();
										});
									});
								});
							});
						});
					});

					it('ロック対象なしにおけるロックの一括解除', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];

						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
	
						// 初期状態ではロックはかかっていない
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
						expect(ctx.state.locked(ctx.sideEffectLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(0);

						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
						});
	
						expect(seq).toStrictEqual([]);

						// 状態変数の更新の実行
						++state.value;

						// ロックしていないため即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);

						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
						expect(ctx.state.locked(ctx.sideEffectLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(0);

						// ロックを一括解除する
						const callback = ctx.state.unlock();
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
						expect(ctx.state.locked(ctx.sideEffectLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(0);

						return new Promise((resolve, reject) => {
							callback();

							// callerは空のため何も起こらない
							expect(seq).toStrictEqual([
								{ idx: reactiveCall, state: 1 },
							]);
							queueMicrotask(() => {
								expect(seq).toStrictEqual([
									{ idx: reactiveCall, state: 1 },
								]);

								resolve();
							});
						});
					});

					it('ロック対象ありにおけるロックの一括解除', () => {
						const reactiveNotCall = 0;
						const reactiveCall1 = 1;
						const reactiveCall2 = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];

						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
	
						// 初期状態ではロックはかかっていない
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
						expect(ctx.state.locked(ctx.sideEffectLabel)).toBe(false);
						expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(0);
	
						// Context.sideEffectLabelについてロックをかける
						ctx.state.lock([ctx.domUpdateLabel, ctx.sideEffectLabel]);
						expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(true);
						expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
						expect(ctx.state.locked(ctx.sideEffectLabel)).toBe(true);
						expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(0);

						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall1, state: state.org });
							},
							label: ctx.domUpdateLabel
						});
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall2, state: state.org });
							},
							label: ctx.sideEffectLabel
						});
	
						expect(seq).toStrictEqual([]);

						return new Promise((resolve, reject) => {
							// 状態変数の更新の実行
							++state.value;
	
							// ロックをしているためcallerは発火されず蓄積される
							expect(seq).toStrictEqual([]);
							expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(1);
							expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(1);
	
							queueMicrotask(() => {
								// ロックをしているためマイクロタスク完了を待っても発火されない
								expect(seq).toStrictEqual([]);
	
								// ロックを一括解除する
								const callback = ctx.state.unlock();
								expect(ctx.state.locked(ctx.domUpdateLabel)).toBe(false);
								expect(ctx.state.lockedCount(ctx.domUpdateLabel)).toBe(0);
								expect(ctx.state.locked(ctx.sideEffectLabel)).toBe(false);
								expect(ctx.state.lockedCount(ctx.sideEffectLabel)).toBe(0);
								expect(seq).toStrictEqual([]);
	
								// callbackの呼び出しタイミングでcallerがICallerLabelのルールに従って評価される
								callback();
								expect(seq).toStrictEqual([
									{ idx: reactiveCall2, state: 1 },
								]);
								queueMicrotask(() => {
									expect(seq).toStrictEqual([
										{ idx: reactiveCall2, state: 1 },
										{ idx: reactiveCall1, state: 1 },
									]);

									resolve();
								});
							});
						});
					});
				});
			});
		});
	});

	describe('単一コンテキストにおける複数の状態変数', () => {
		it('StateContext.callによる検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			const state2 = new State(ctx, 10);
			expect(state1.org).toBe(0);
			expect(state2.org).toBe(10);

			// 初回およびstate1もしくはstate2が変更されたときに呼びだされる関数を設定
			const caller = {
				caller: () => {
					seq.push({ idx: reactiveCall, state: state1.org });
					seq.push({ idx: reactiveCall, state: state2.org });
					state1.value;
					state2.value;
				}
			};
			const captureList = ctx.call(caller);
			// state1とstate2をキャプチャしたことの確認
			expect(captureList.caller).toBe(caller);
			expect(captureList.states.length).toBe(2);
			expect(captureList.states[0]).toBe(state1);
			expect(captureList.states[1]).toBe(state2);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveCall, state: 10 },
			]);

			// 状態変数の更新の実行
			++state1.value;
			expect(state1.org).toBe(1);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveCall, state: 10 },
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveCall, state: 10 },
			]);

			// 状態変数の更新の実行
			++state2.value;
			expect(state2.org).toBe(11);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveCall, state: 10 },
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveCall, state: 10 },
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveCall, state: 11 },
			]);

			// callerの削除後は監視は行われない
			captureList.states.forEach(state => state.delete(captureList.caller));
			++state1.value;
			expect(state1.org).toBe(2);
			++state2.value;
			expect(state2.org).toBe(12);
			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveCall, state: 10 },
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveCall, state: 10 },
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveCall, state: 11 },
			]);
		});
	});

	describe('複数コンテキストにおける単一の状態変数', () => {
		it('StateContext.callによる検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall1 = 1;
			const reactiveCall2 = 1;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx1 = new StateContext();
			const ctx2 = new StateContext();
			const state = new State(ctx1, 0);
			expect(state.org).toBe(0);

			// 初回およびstateが変更されたときに呼びだされる関数を設定
			const caller1 = {
				caller: () => {
					seq.push({ idx: reactiveCall1, state: state.org });
					state.value;
				}
			};
			const caller2 = {
				caller: () => {
					seq.push({ idx: reactiveCall2, state: state.org });
					state.value;
				}
			};
			const captureList1 = ctx1.call(caller1);
			const captureList2 = ctx2.call(caller2);
			// stateをキャプチャしたことの確認
			expect(captureList1.caller).toBe(caller1);
			expect(captureList1.states.length).toBe(1);
			expect(captureList1.states[0]).toBe(state);
			// stateをキャプチャしなかったことの確認
			expect(captureList2.caller).toBe(caller2);
			expect(captureList2.states.length).toBe(0);
			expect(seq).toStrictEqual([
				{ idx: reactiveCall1, state: 0 },
				{ idx: reactiveCall2, state: 0 },
			]);

			// 状態変数の更新の実行
			++state.value;
			expect(state.org).toBe(1);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall1, state: 0 },
				{ idx: reactiveCall2, state: 0 },
				{ idx: reactiveCall1, state: 1 },
			]);

			// callerの削除後は監視は行われない
			captureList1.states.forEach(state => state.delete(captureList1.caller));
			++state.value;
			expect(state.org).toBe(2);
			expect(seq).toStrictEqual([
				{ idx: reactiveCall1, state: 0 },
				{ idx: reactiveCall2, state: 0 },
				{ idx: reactiveCall1, state: 1 },
			]);
		});
	});

	// describe('複数コンテキストにおける複数の状態変数', () => {

	// });

	describe('単方向関連付け', () => {
		it('状態変数→状態変数の単方向関連付け', () => {
			const ctx = new StateContext();
			const state1 = new State(ctx, 100);
			const state2 = new State(ctx, 200);
	
			// ctx上で単方向関連付けされたデータの作成
			const caller = ctx.unidirectional(state1, state2);
	
			// state2にstate1の内容が反映されていることの確認
			expect(state2.org).toBe(state1.org);
	
			// state1の更新時にstate2に同期されることの確認
			++state1.value;
			expect(state1.org).toBe(101);
			expect(state2.org).toBe(state1.org);
	
			// state2の更新時にstate1に同期されないことの確認
			++state2.value;
			expect(state1.org).toBe(101);
			expect(state2.org).toBe(state1.org + 1);
	
			// 単方向関連付けの削除をすると同期されないことの確認
			caller.states.forEach(state => state.delete(caller.caller));
			state1.value = 10;
			expect(state1.org).toBe(10);
			expect(state2.org).toBe(102);
		});

		it('関数→状態変数の単方向関連付け', () => {
			const ctx1 = new StateContext();
			const ctx2 = new StateContext();
			const state1 = new State(ctx1, 100);
			const state2 = new State(ctx2, 200);
			const state3 = new State(ctx1, 400);
	
			// ctx1上で単方向関連付けされたデータの作成
			const caller = ctx1.unidirectional(() => state1.value + state2.value, state3);
	
			// state3にstate1とstate2の内容が反映されていることの確認
			expect(state3.org).toBe(state1.org + state2.org);
	
			// state1の更新時にstate3に同期されることの確認
			++state1.value;
			expect(state1.org).toBe(101);
			expect(state3.org).toBe(state1.org + state2.org);

			// state2の更新時にstate3に同期されないことの確認
			++state2.value;
			expect(state2.org).toBe(201);
			expect(state3.org).toBe(state1.org + 200);

			// state3の更新時にstate1やstate2に同期されないことの確認
			++state3.value;
			expect(state1.org).toBe(101);
			expect(state2.org).toBe(201);
	
			// 単方向関連付けの削除をすると同期されないことの確認
			caller.states.forEach(state => state.delete(caller.caller));
			state1.value = 10;
			expect(state1.org).toBe(10);
			expect(state3.org).toBe(302);
		});

		it('状態変数→関数の単方向関連付け', () => {
			const ctx1 = new StateContext();
			const state1 = new State(ctx1, 100);
			const state3 = new State(ctx1, 400);
			const state4 = new State(ctx1, 1000);
	
			// ctx1上で単方向関連付けされたデータの作成
			const caller = ctx1.unidirectional(state1, (val) => { state3.value = val; state4.value = val; });
	
			// state3とstate4にstate1の内容が反映されていることの確認
			expect(state3.org).toBe(state1.org);
			expect(state4.org).toBe(state1.org);
	
			// state1の更新時にstate3とstate4に同期されることの確認
			++state1.value;
			expect(state1.org).toBe(101);
			expect(state3.org).toBe(state1.org);
			expect(state4.org).toBe(state1.org);

			// state3の更新時にstate1に同期されないことの確認
			++state3.value;
			expect(state1.org).toBe(101);

			// state4の更新時にstate1に同期されないことの確認
			++state4.value;
			expect(state1.org).toBe(101);
	
			// 単方向関連付けの削除をすると同期されないことの確認
			caller.states.forEach(state => state.delete(caller.caller));
			state1.value = 10;
			expect(state1.org).toBe(10);
			expect(state3.org).toBe(102);
			expect(state4.org).toBe(102);
		});

		it('関数→関数の単方向関連付け', () => {
			const ctx1 = new StateContext();
			const ctx2 = new StateContext();
			const state1 = new State(ctx1, 100);
			const state2 = new State(ctx2, 200);
			const state3 = new State(ctx1, 400);
			const state4 = new State(ctx1, 1000);
	
			// ctx1上で単方向関連付けされたデータの作成
			const caller = ctx1.unidirectional(() => state1.value + state2.value, (val) => { state3.value = val; state4.value = val; });
	
			// state3とstate4にstate1とstate2の内容が反映されていることの確認
			expect(state3.org).toBe(state1.org + state2.org);
			expect(state4.org).toBe(state1.org + state2.org);
	
			// state1の更新時にstate3とstate4に同期されることの確認
			++state1.value;
			expect(state1.org).toBe(101);
			expect(state3.org).toBe(state1.org + state2.org);
			expect(state4.org).toBe(state1.org + state2.org);

			// state2の更新時にstate3とstate4に同期されないことの確認
			++state2.value;
			expect(state2.org).toBe(201);
			expect(state3.org).toBe(state1.org + 200);
			expect(state4.org).toBe(state1.org + 200);

			// state3の更新時にstate1やstate2に同期されないことの確認
			++state3.value;
			expect(state1.org).toBe(101);
			expect(state2.org).toBe(201);

			// state4の更新時にstate1やstate2に同期されないことの確認
			++state4.value;
			expect(state1.org).toBe(101);
			expect(state2.org).toBe(201);
	
			// 単方向関連付けの削除をすると同期されないことの確認
			caller.states.forEach(state => state.delete(caller.caller));
			state1.value = 10;
			expect(state1.org).toBe(10);
			expect(state3.org).toBe(302);
			expect(state4.org).toBe(302);
		});

		it('双方向関連付け', () => {
			const ctx = new StateContext();
			const state1 = new State(ctx, 100);
			const state2 = new State(ctx, 200);

			// 状態変数の更新の通知が相互に起きることにより無限ループが発生しないことの確認
	
			// ctx上で双方向関連付けされたデータの作成
			ctx.unidirectional(state1, state2);
			ctx.unidirectional(state2, state1);
			
			// state2にstate1の内容が反映されていることの確認
			expect(state1.org).toBe(100);
			expect(state2.org).toBe(state1.org);
	
			// state1の更新時にstate2に同期されることの確認
			++state1.value;
			expect(state1.org).toBe(101);
			expect(state2.org).toBe(state1.org);
	
			// state2の更新時にstate1に同期されることの確認
			++state2.value;
			expect(state1.org).toBe(102);
			expect(state2.org).toBe(state1.org);
		});

		it('NotStateの単方向関連付け', () => {
			const ctx = new StateContext();
			const state1 = new NotState(100);
			const state2 = new State(ctx, 200);

			// ctx上で単方向関連付けされたデータの作成
			const caller = ctx.unidirectional(state1, state2);
			// 関連付けの際に利用された状態変数は存在しないことの確認
			expect(caller.states.length).toBe(0);
	
			// state2にstate1の内容が反映されていることの確認
			expect(state2.org).toBe(state1.value);
	
			// state2の更新時にstate1に同期されないことの確認
			++state2.value;
			expect(state1.value).toBe(100);
			expect(state2.org).toBe(state1.value + 1);
		});
	});
});
