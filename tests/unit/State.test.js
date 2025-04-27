/** @jest-environment jsdom */
import { StateContext, State, watch, CommonLabel, Context, StateComponent, NotState } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

describe('State', () => {
	describe('単一コンテキストにおける単一の状態変数', () => {
		it('初期値の確認', () => {
			const ctx = new StateContext();
			const state = new State(ctx, 100);

			// 初期値の確認
			expect(state.org).toBe(100);
			// 状態変数が属するStateContextの確認
			expect(state.ctx).toBe(ctx);
		});

		describe('値の更新の検知', () => {
			it('コンテキストをもたない場合は検知不可', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				expect(state.org).toBe(0);

				// コンテキストをもたないため、stateの更新で呼び出されない関数
				(() => {
					seq.push({ idx: reactiveNotCall, state: state.org });
					state.value;
				})();

				expect(seq).toStrictEqual([
					{ idx: reactiveNotCall, state: 0 },
				]);

				// 状態変数の更新の実行
				++state.value;
				expect(state.org).toBe(1);

				expect(seq).toStrictEqual([
					{ idx: reactiveNotCall, state: 0 },
				]);
			});

			it('State.addによる検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				expect(state.org).toBe(0);

				// stateが変更されたときに呼びだされる関数を設定
				const caller = {
					caller: () => {
						seq.push({ idx: reactiveCall, state: state.org });
						// 直接追加のため状態変数の使用は不要
					}
				};
				state.add(caller);
	
				expect(seq).toStrictEqual([]);

				// 状態変数の更新の実行
				++state.value;
				expect(state.org).toBe(1);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 1 },
				]);

				// callerの削除後は監視は行われない
				state.delete(caller);
				++state.value;
				expect(state.org).toBe(2);
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 1 },
				]);
			});

			it('watchによる検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state = new State(ctx, 0);
				expect(state.org).toBe(0);

				// コンテキストを指定して状態変数の更新を観測する関数を設定
				let prevWatch = state.org;
				const caller = watch(ctx, state, (prev, next) => {
					seq.push({ idx: reactiveCall, state: state.org });
					// 更新前後の値の検証
					expect(prev).toBe(prevWatch);
					expect(next).toBe(state.org);
					prevWatch = next;
				});

				expect(seq).toStrictEqual([]);

				// 状態変数の更新の実行
				++state.value;
				expect(state.org).toBe(1);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 1 },
				]);

				// callerの削除後は監視は行われない
				state.delete(caller);
				++state.value;
				expect(state.org).toBe(2);
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 1 },
				]);
			});

			it('検知なしの状態変数の更新', () => {
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
				++state.org;
				expect(state.org).toBe(1);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 0 },
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
		
						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
							label
						});
			
						expect(seq).toStrictEqual([]);
		
						// 状態変数の更新の実行
						++state.value;
		
						// 状態変数の更新の検知は即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);

						// 蓄積した更新の処理
						label.proc();

						// 評価済みのため変わらない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);
					});

					it('DomUpdateLabel', () => {
						const reactiveNotCall = 0;
						const reactiveCall = 1;
						/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
						const seq = [];
			
						const ctx = new Context(window);
						const state = new State(ctx.state, 0);
		
						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
							label: ctx.domUpdateLabel
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
									{ idx: reactiveCall, state: 2 },
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
		
						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
							label: ctx.sideEffectLabel
						});

						// コンポーネント外ではCommonLabelと等価
						expect(ctx.sideEffectLabel).toBeInstanceOf(CommonLabel);
			
						expect(seq).toStrictEqual([]);
		
						// 状態変数の更新の実行
						++state.value;
		
						// 状態変数の更新の検知は即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);

						// 蓄積した更新の処理
						ctx.sideEffectLabel.proc();

						// 評価済みのため変わらない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
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
		
						// stateが変更されたときに呼びだされる関数を設定
						state.add({
							caller: () => {
								seq.push({ idx: reactiveCall, state: state.org });
							},
							label: ctx2.sideEffectLabel
						});

						// コンポーネント内ではCommonLabelではない
						expect(ctx2.sideEffectLabel).not.toBeInstanceOf(CommonLabel);

						expect(seq).toStrictEqual([]);
		
						// 状態変数の更新の実行
						++state.value;
			
						// 状態変数の更新の検知は即時評価される
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
						]);

						// 蓄積した更新の処理
						ctx2.sideEffectLabel.proc();

						// 評価済みのため変わらない
						expect(seq).toStrictEqual([
							{ idx: reactiveCall, state: 1 },
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

	describe('複数コンテキストにおける複数の状態変数', () => {
		it('1つのStateContextで閉じたコンテキストのネスト時の値の更新の検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const reactiveNestCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			expect(state1.org).toBe(0);
			const state2 = new State(ctx, 0);
			expect(state2.org).toBe(0);

			// 初回およびstateが変更されたときに呼びだされる関数を設定
			const captureList = ctx.call({ caller: () => {
				seq.push({ idx: reactiveCall, state: state1.org });
				state1.value;
				// ネストさせる
				const captureList = ctx.call({ caller: () => {
					seq.push({ idx: reactiveNestCall, state: state2.org });
					state1.value;
					state2.value;
				}});
				// state1とstate2をキャプチャしたことの確認
				expect(captureList.states.length).toBe(2);
				expect(captureList.states[0]).toBe(state1);
				expect(captureList.states[1]).toBe(state2);
			}});
			// state1をキャプチャしてstate2をキャプチャしなかったことの確認
			expect(captureList.states.length).toBe(1);
			expect(captureList.states[0]).toBe(state1);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveNestCall, state: 0 },
			]);

			// 状態変数の更新の実行
			++state2.value;
			expect(state2.org).toBe(1);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveNestCall, state: 0 },
				{ idx: reactiveNestCall, state: 1 },
			]);

			// 状態変数の更新の実行
			++state1.value;
			expect(state1.org).toBe(1);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveNestCall, state: 0 },
				{ idx: reactiveNestCall, state: 1 },
				// Setの追加された順に関数は呼び出される
				// 新規に追加されたcallerは呼び出されない
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveNestCall, state: 1 },
				{ idx: reactiveNestCall, state: 1 },
			]);

			// 状態変数の更新の実行
			++state2.value;
			expect(state2.org).toBe(2);

			expect(seq).toStrictEqual([
				{ idx: reactiveCall, state: 0 },
				{ idx: reactiveNestCall, state: 0 },
				{ idx: reactiveNestCall, state: 1 },
				{ idx: reactiveCall, state: 1 },
				{ idx: reactiveNestCall, state: 1 },
				{ idx: reactiveNestCall, state: 1 },
				// state1の更新によりstate2の更新を検知する関数が2つになる
				{ idx: reactiveNestCall, state: 2 },
				{ idx: reactiveNestCall, state: 2 },
			]);
		});
	});

	it('単方向関連付け', () => {
		const ctx = new StateContext();
		const state1 = new State(ctx, 100);

		// ctx上で単方向関連付けされたデータの作成
		const { state: state2, caller } = state1.unidirectional(ctx);

		// state2にstate1の内容が反映されていることの確認
		expect(state2.org).toBe(100);
		expect(state2.ctx).toBe(ctx);

		// state1の更新時にstate2に同期されることの確認
		++state1.value;
		expect(state1.org).toBe(101);
		expect(state2.org).toBe(state1.org);

		// state2の更新時にstate1に同期されないことの確認
		++(/** @type { State<number> } */(state2).value);
		expect(state1.org).toBe(101);
		expect(state2.org).toBe(102);

		// 単方向関連付けの削除をすると同期されないことの確認
		caller.states.forEach(state => state.delete(caller.caller));
		state1.value = 10;
		expect(state1.org).toBe(10);
		expect(state2.org).toBe(102);
	});

	describe('更新の観測', () => {
		it('更新の観測を行う状態変数の作成', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const referenceCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);

			// 状態変数に参照が発生したときに呼び出すハンドラの設定
			state1.onreference = state => {
				seq.push({ idx: referenceCall, state: state.org });
			};
			// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化される
			const { state: state2, caller } = state1.observe(ctx);

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

		it('直接的参照の検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const referenceCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			const state2 = new State(ctx, 1);

			// 状態変数に参照が発生したときに呼び出すハンドラの設定
			state1.onreference = state => {
				seq.push({ idx: referenceCall, state: state.org });
			};
			// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化される
			state2.observe(state1);

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

		it('ラベル指定付きの直接的参照の検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const referenceCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new Context(window);
			const state1 = new State(ctx.state, 0);
			const state2 = new State(ctx.state, 1);

			// 状態変数に参照が発生したときに呼び出すハンドラの設定
			state1.onreference = state => {
				seq.push({ idx: referenceCall, state: state.org });
			};

			return new Promise((resolve, reject) => {
				state2.observe(state1, ctx.domUpdateLabel);
				// 初期値の反映は即時評価される
				expect(state2.org).toBe(0);

				expect(seq).toStrictEqual([]);

				// state2が変更されたときに呼びだされる関数を設定
				state2.add({ caller: () => {
					seq.push({ idx: reactiveCall, state: state2.org });
				}});

				// state1.onreferenceはstate2.addの契機で発火される
				// これを遅延評価するにはstat2.addのcallerで指定したラベルで制御を行う
				expect(state1.onreference).toBe(true);
				expect(seq).toStrictEqual([
					{ idx: referenceCall, state: 0 },
				]);

				// 状態変数の更新
				++state1.value;

				queueMicrotask(() => {
					// マイクロタスク完了の契機でstate1の値がstate2に反映される
					expect(state2.org).toBe(1);
					resolve();
				});
			});
		});

		it('既に参照する状態変数が利用済みの場合の直接的参照の検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const referenceCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			const state2 = new State(ctx, 1);

			// state2が変更されたときに呼びだされる関数を設定
			// state2がstate1を観測する前に利用済みにしておく
			state2.add({ caller: () => {
				seq.push({ idx: reactiveCall, state: state2.org });
			}});

			expect(seq).toStrictEqual([]);

			// 状態変数に参照が発生したときに呼び出すハンドラの設定
			state1.onreference = state => {
				seq.push({ idx: referenceCall, state: state.org });
			};
			// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化されるがstate2は利用済みのため即時評価される
			state2.observe(state1);

			// State.observeの契機でstate1.onreferenceが発火する
			expect(state1.onreference).toBe(true);
			expect(seq).toStrictEqual([
				// 単方向関連付けによるcallerが先に呼び出される
				{ idx: reactiveCall, state: 0 },
				{ idx: referenceCall, state: 0 },
			]);
		});

		it('既に参照される状態変数が利用済みの場合の直接的参照の検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const referenceCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			const state2 = new State(ctx, 1);

			// state1が変更されたときに呼びだされる関数を設定
			// state2がstate1を観測する前に利用済みにしておく
			state1.add({ caller: () => {
				seq.push({ idx: reactiveCall, state: state1.org });
			}});

			expect(seq).toStrictEqual([]);

			// 状態変数に参照が発生したときに呼び出すハンドラの設定
			state1.onreference = state => {
				seq.push({ idx: referenceCall, state: state.org });
			};

			// state1は利用済みのため即時評価される
			expect(state1.onreference).toBe(true);
			expect(seq).toStrictEqual([
				{ idx: referenceCall, state: 0 },
			]);

			// state1.onreferenceの発火済みのため発火しない
			state2.observe(state1);
			expect(seq).toStrictEqual([
				{ idx: referenceCall, state: 0 },
			]);
		});

		it('多重の直接的参照の検知', () => {
			const reactiveNotCall = 0;
			const reactiveCall = 1;
			const referenceCall = 2;
			/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
			const seq = [];

			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			const state2 = new State(ctx, 1);
			const state3 = new State(ctx, 2);

			// 状態変数に参照が発生したときに呼び出すハンドラの設定
			state1.onreference = state => {
				seq.push({ idx: referenceCall, state: state.org });
			};
			// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化される
			state2.observe(state1);
			state3.observe(state1);

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
		});

		describe('間接的参照の検知', () => {
			it('state1→state2・state2→state3の順番で観測の設定', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				const referenceCall = 2;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state1 = new State(ctx, 0);
				const state2 = new State(ctx, 1);
				const state3 = new State(ctx, 2);
	
				state1.onreference = state => {
					seq.push({ idx: referenceCall, state: state.org });
				};
				state2.observe(state1);
				state3.observe(state2);
	
				expect(seq).toStrictEqual([]);
	
				// state3が変更されたときに呼びだされる関数を設定
				state3.add({ caller: () => {
					seq.push({ idx: reactiveCall, state: state3.org });
				}});
	
				// state3.addの契機でstate1.onreferenceが発火する
				expect(state1.onreference).toBe(true);
				expect(seq).toStrictEqual([
					{ idx: referenceCall, state: 0 },
				]);
			});

			it('state2→state3・state1→state2の順番で観測の設定', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				const referenceCall = 2;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state1 = new State(ctx, 0);
				const state2 = new State(ctx, 1);
				const state3 = new State(ctx, 2);
	
				state3.observe(state2);
				state1.onreference = state => {
					seq.push({ idx: referenceCall, state: state.org });
				};
				state2.observe(state1);
	
				expect(seq).toStrictEqual([]);
	
				// state3が変更されたときに呼びだされる関数を設定
				state3.add({ caller: () => {
					seq.push({ idx: reactiveCall, state: state3.org });
				}});
	
				// state3.addの契機でstate1.onreferenceが発火する
				expect(state1.onreference).toBe(true);
				expect(seq).toStrictEqual([
					{ idx: referenceCall, state: 0 },
				]);
			});

			it('既に参照する状態変数が利用済みの場合のstate1→state2・state2→state3の順番で観測の設定したときの間接的参照の検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				const referenceCall = 2;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state1 = new State(ctx, 0);
				const state2 = new State(ctx, 1);
				const state3 = new State(ctx, 2);

				// state2が変更されたときに呼びだされる関数を設定
				// state3がstate1を観測する前に利用済みにしておく
				state3.add({ caller: () => {
					seq.push({ idx: reactiveCall, state: state3.org });
				}});
	
				expect(seq).toStrictEqual([]);
	
				state1.onreference = state => {
					seq.push({ idx: referenceCall, state: state.org });
				};
				state2.observe(state1);

				expect(seq).toStrictEqual([]);

				// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化されるがstate3は利用済みのため即時評価される
				state3.observe(state2);
	
				// State.observeの契機でstate1.onreferenceが発火する
				expect(state1.onreference).toBe(true);
				expect(seq).toStrictEqual([
					// 単方向関連付けによるcallerが先に呼び出される
					{ idx: reactiveCall, state: 0 },
					{ idx: referenceCall, state: 0 },
				]);
			});

			it('既に参照する状態変数が利用済みの場合のstate2→state3・state1→state2の順番で観測の設定したときの間接的参照の検知', () => {
				const reactiveNotCall = 0;
				const reactiveCall = 1;
				const referenceCall = 2;
				/** @type { { idx: number; state: number; }[] } 呼び出し順序を記録するシーケンス */
				const seq = [];
	
				const ctx = new StateContext();
				const state1 = new State(ctx, 0);
				const state2 = new State(ctx, 1);
				const state3 = new State(ctx, 2);

				// state2が変更されたときに呼びだされる関数を設定
				// state3がstate1を観測する前に利用済みにしておく
				state3.add({ caller: () => {
					seq.push({ idx: reactiveCall, state: state3.org });
				}});
	
				expect(seq).toStrictEqual([]);

				state3.observe(state2);

				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 1 },
				]);

				// State.observeによる単方向関連付けではstate1.onreferenceの発火は無効化されるがstate3は利用済みのため即時評価される
				state1.onreference = state => {
					seq.push({ idx: referenceCall, state: state.org });
				};
				state2.observe(state1);
	
				// State.observeの契機でstate1.onreferenceが発火する
				expect(state1.onreference).toBe(true);
				expect(seq).toStrictEqual([
					{ idx: reactiveCall, state: 1 },
					{ idx: reactiveCall, state: 0 },
					{ idx: referenceCall, state: 0 },
				]);
			});
		});

		it('観測による状態変数の変更', () => {
			const ctx = new StateContext();
			const state1 = new State(ctx, 0);
			const state2 = new State(ctx, 1);

			// 観測の開始によりstate1がstate2に適用される
			expect(state2.org).toBe(1);
			const caller = state2.observe(state1);
			expect(state2.org).toBe(0);

			// 状態変数の更新の実行
			++state2.value;

			// state2の変更はstate1に反映されない
			expect(state2.org).toBe(1);
			expect(state1.org).toBe(0);

			// 観測される状態変数の更新の実行
			state1.value = 3;

			// state1の変更はstate2に反映される
			expect(state2.org).toBe(3);
			expect(state1.org).toBe(3);

			// 状態変数の関連付けの削除をして状態変数を更新する
			caller.states.forEach(state => state.delete(caller.caller));
			state1.value = 5;
			expect(state2.org).toBe(3);
			expect(state1.org).toBe(5);
		});

		it('定数の観測', () => {
			const ctx = new StateContext();
			const state1 = 0;
			const state2 = new State(ctx, 1);

			// 観測の開始によりstate1がstate2に適用される
			expect(state2.org).toBe(1);
			state2.observe(state1);
			expect(state2.org).toBe(0);
		});

		it('状態変数としてふるまわない変数の観測', () => {
			const ctx = new StateContext();
			const state1 = new NotState(0);
			const state2 = new State(ctx, 1);

			// 観測の開始によりstate1がstate2に適用される
			expect(state2.org).toBe(1);
			state2.observe(state1);
			expect(state2.org).toBe(0);
		});
	});
});
