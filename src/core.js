/**
 * @typedef {{
 * 		label?: ICallerLabel | undefined;
 * 		caller: ()=> unknown;
 * }} CallerType 状態変数における呼び出し元についての型
 */

/**
 * CallerTypeに対するラベルのインターフェース
 * @interface
 */
class ICallerLabel {
	/**
	 * 状態の更新の蓄積を行う
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	/* istanbul ignore next */
	update(caller) { throw new Error('not implemented.'); }

	/**
	 * 蓄積した更新を処理する
	 */
	/* istanbul ignore next */
	proc() { throw new Error('not implemented.'); }
}

/**
 * 特に何もせずに即時評価を行うラベルの型
 * @implements { ICallerLabel }
 */
class CommonLabel {

	/**
	 * 状態の更新の蓄積を行う
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	update(caller) {
		caller();
	}

	/**
	 * 蓄積した更新を処理する
	 */
	proc() {}
}

/**
 * DOM更新のためのCallerTypeに対するラベルの型
 * @implements { ICallerLabel }
 */
class DomUpdateLabel {
	/** @type { Context } 更新対象となるコンテキスト */
	#ctx;
	/** @type { Set<CallerType['caller']> } DOM更新のためのcallerの集合 */
	#domUpdateTaskSet = new Set();

	/**
	 * コンストラクタ
	 * @param { Context } ctx 更新対象とみることができるコンテキスト
	 */
	constructor(ctx) {
		this.#ctx = ctx;
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	update(caller) {
		// Context経由でDomUpdateControllerのメソッドを呼び出す
		this.#domUpdateTaskSet.add(caller);
		this.#ctx.update(this);
	}

	/**
	 * 蓄積した更新を処理する
	 */
	proc() {
		const taskSet = this.#domUpdateTaskSet;
		this.#domUpdateTaskSet = new Set();

		// DOM更新の前後でupdateライフサイクルフックを発火しつつタスクを実行する
		this.#ctx.component?.onBeforeUpdate?.();
		for (const task of taskSet) {
			// DOM更新は同期的に行われるべきのため非同期関数の場合は考慮しない
			task();
		}
		this.#ctx.component?.onAfterUpdate?.();
	}
}

/**
 * DomUpdateCallerLabelに関するコントローラ(queueMicrotask()呼び出しを1回に限定するためのもの)
 */
class DomUpdateController {
	/** @type { Set<ICallerLabel> } DOM更新のためのDomUpdateCallerLabelの集合 */
	#callerLabelSet = new Set();
	/** @type { boolean } DOMの更新のタスクが既にマイクロタスクキューに追加されているか */
	#domUpdateFlag = false;

	/**
	 * 状態の更新の蓄積を行う
	 * @param { ICallerLabel } callerLabel 更新情報
	 */
	update(callerLabel) {
		this.#callerLabelSet.add(callerLabel);

		// マイクロタスクに追加する
		if (!this.#domUpdateFlag) {
			this.#domUpdateFlag = true;
			queueMicrotask(() => {
				// タスクの実行と初期化
				const callerLabelSet = this.#callerLabelSet;
				this.#callerLabelSet = new Set();
				this.#domUpdateFlag = false;
				for (const callerLabel of callerLabelSet) {
					callerLabel.proc();
				}
			});
		}
	}
}

/**
 * コンポーネント上での副作用が生じる可能性がある更新に対するラベルの型
 * @template { ComponentType<K> } K
 * @implements { ICallerLabel }
 */
class SideEffectLabel {
	/** @type { StateComponent<K> } 更新対象となるコンポーネント */
	#component;

	/**
	 * コンストラクタ
	 * @param { StateComponent<K> } component 更新対象とみることができるコンポーネント
	 */
	constructor(component) {
		this.#component = component;
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	update(caller) {
		createWrapperFunction(caller, this.#component)();
	}

	/**
	 * 蓄積した更新を処理する
	 */
	proc() {}
}

/**
 * Stateのインターフェース
 * @template T
 */
class IState {
	/**
	 * @returns { T }
	 */
	/* istanbul ignore next */
	get value() { throw new Error('not implemented.'); }

	/**
	 * 単方向データの作成
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	/* istanbul ignore next */
	unidirectional(ctx, label = undefined) { throw new Error('not implemented.'); }

	/**
	 * thisを観測するデータの作成
	 * @param { StateContext } ctx 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	/* istanbul ignore next */
	observe(ctx, label = undefined) { throw new Error('not implemented.'); }

	/**
	 * 状態変数が属するコンテキストの取得
	 * @returns { StateContext | undefined }
	 */
	get ctx() { return undefined; }
}

/**
 * 状態変数と同様の振る舞いをする変数
 * @template T
 * @extends { IState<T> }
 */
class NotState extends IState {
	/** @type { T } 変数の本体 */
	#value;

	/**
	 * コンストラクタ
	 * @param { T } value 変数の値
	 */
	constructor(value) {
		super();
		this.#value = value;
	}

	/**
	 * @returns { T }
	 */
	get value() { return this.#value; }

	/**
	 * 単方向データの作成
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) {
		return { state: this };
	}

	/**
	 * thisを観測するデータの作成
	 * @param { StateContext } ctx 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	observe(ctx, label = undefined) {
		return { state: this };
	}
}

/**
 * 状態変数
 * @template T
 * @extends { IState<T> }
 */
class State extends IState {
	/** @type { StateContext } 状態変数の扱っているコンテキスト */
	#ctx;
	/** @type { T } 状態変数の本体 */
	#value;
	/** @type { Set<CallerType> } 呼び出し元のハンドラのリスト */
	#callerList = new Set();
	/** @type { ((val: State<T>) => void) | undefined | true } 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントのハンドラ */
	#onreference = undefined;
	/** @type { number } thisを観測している状態変数の数 */
	#observeCnt = 0;

	/**
	 * コンストラクタ
	 * @param { StateContext } ctx 状態変数を扱っているコンテキスト
	 * @param { T } value 状態変数の初期値
	 */
	constructor(ctx, value) {
		super();
		this.#ctx = ctx;
		this.#value = value;
	}

	get value() {
		this.#ctx.onreference(this);
		// 呼び出し元が有効なら追加する
		const current = this.#ctx.current;
		if (current && !this.#callerList.has(current.caller)) {
			this.#ctx.notify(this);
			this.#callerList.add(current.caller);
		}
		return this.#value;
	}

	set value(value) {
		if (value !== this.#value) {
			this.#value = value;
			this.#ctx.update(this.#callerList);
		}
	}

	/**
	 * 単方向データの作成
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) {
		const dest = new State(ctx, undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest, label) };
	}

	/**
	 * 監視を伴わない値の取得
	 */
	get org() { return this.#value; }

	/**
	 * 監視を伴わない値の設定
	 */
	set org(value) { this.#value = value; }

	/**
	 * 状態変数が属するコンテキストの取得
	 */
	get ctx() { return this.#ctx; }

	/**
	 * 明示的に呼び出し元情報を追加する
	 * @param { CallerType } caller 呼び出し元の関数
	 */
	add(caller) {
		this.#ctx.onreference(this);
		this.#callerList.add(caller);
	}

	/**
	 * 明示的に呼び出し元情報を削除する
	 * @param { CallerType } caller 呼び出し元の関数
	 * @returns 
	 */
	delete(caller) { return this.#callerList.delete(caller); }

	/**
	 * 状態変数が利用されているかの判定を行う
	 */
	get utilized() {
		return this.#onreference === true ? true : this.#callerList.size > this.#observeCnt;
	}

	/**
	 * 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントの設定
	 * @param { (val: State<T>) => unknown } callback イベントハンドラ
	 */
	set onreference(callback) {
		/**
		 * #onreferenceの形式の関数
		 * @param { State<T> } s
		 */
		const c = s => {
			s.#onreference = true;
			callback(s);
		};
		if (this.utilized) {
			// 既にthisが参照されているならば即時でcを呼び出す
			c(this);
		}
		else {
			this.#onreference = c;
		}
	}

	/**
	 * 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントハンドラの取得
	 */
	get onreference() {
		return this.#onreference;
	}

	/**
	 * thisを観測するデータの作成
	 * @overload
	 * @param { StateContext } prop 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	/**
	 * propの観測(onreferenceの連鎖的な追跡も実施する)
	 * @overload
	 * @param { CtxValueType<T> | () => T } prop 観測対象の変数
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { caller: CallerType; states: State<unknown>[] } | undefined } 呼び出し元情報
	 */
	/**
	 * propの観測(onreferenceの連鎖的な追跡も実施する)/thisを観測するデータの作成
	 * @param { CtxValueType<T> | (() => T) | StateContext } prop 観測対象の変数/生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 */
	observe(prop, label = undefined) {
		if (prop instanceof StateContext) {
			/** @type { State<T> } */
			const state = new State(prop, undefined);
			return { state, caller: state.observe(this, label) };
		}
		if (prop instanceof State || prop instanceof Computed || prop instanceof Function) {
			// onreferenceが発火しないように無効化して単方向関連付け
			const caller = this.ctx.noreference(() => this.ctx.unidirectional(prop, this, label));
			// 状態変数の参照状況の更新
			caller.states.forEach(state => ++state.#observeCnt);

			/**
			 * 関連付けられた状態変数のonreferenceを連鎖的に呼び出す#onreferenceの形式の関数
			 * @param { State<T> } s
			 */
			const c = s => {
				s.#onreference = true;
				caller.states.forEach(state => {
					if (state.#onreference instanceof Function) {
						state.#onreference(state);
					}
					else {
						state.#onreference = true;
					}
				});
			};

			if (this.utilized) {
				// 既にthisが参照されているならば即時でcを呼び出す
				c(this);
			}
			else {
				this.#onreference = c;
			}

			return caller;
		}
		else if (prop instanceof IState) {
			this.value = prop.value;
		}
		else {
			this.value = prop;
		}
	}
}

/**
 * 算出プロパティ
 * @template T
 * @extends { IState<T> }
 */
class Computed extends IState {
	/** @type { State<T> } 状態変数 */
	#state;

	/**
	 * コンストラクタ
	 * @param { StateContext } ctx 状態変数を扱っているコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @param { () => T } f 算出プロパティを計算する関数
	 */
	constructor(ctx, f, label = undefined) {
		super();
		this.#state = new State(ctx, undefined);
		this.#state.observe(f, label);
	}

	get value() { return this.#state.value; }

	/**
	 * 単方向データの作成
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) {
		const dest = new State(ctx, undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest, label) };
	}

	/**
	 * thisを観測するデータの作成
	 * @param { StateContext } ctx 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	observe(ctx, label = undefined) {
		/** @type { State<T> } */
		const state = new State(ctx, undefined);
		return { state, caller: state.observe(this, label) };
	}

	/**
	 * 状態変数が属するコンテキストの取得
	 */
	get ctx() { return this.#state.ctx; }

	/**
	 * 明示的に呼び出し元情報を追加する
	 * @param { CallerType } caller 呼び出し元の関数
	 */
	add(caller) { this.#state.add(caller); }

	/**
	 * 明示的に呼び出し元情報を削除する
	 * @param { CallerType } caller 呼び出し元の関数
	 * @returns 
	 */
	delete(caller) { return this.#state.delete(caller); }

	/**
	 * 内部で保持している状態変数の取得(開発者以外の利用は非推奨)
	 */
	get state() { return this.#state; }
}

/**
 * @template T
 * @typedef { T extends IState<infer U> ? U : T } ElementTypeOfState 状態変数の要素型を得る
 */

/**
 * @template { string } K
 * @typedef { K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement } CreatedElementType タグからノードの型を得る
 */

/**
 * @template { (ctx: Context, props: CompPropTypes<K> | undefined, children: (GenStateNode | GenStateNodeSet)[] | undefined) => (GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> }) } K
 * @typedef { (...args: Parameters<K>) => ReturnType<K> } ComponentType コンポーネントの型
 */

/**
 * @template { ComponentType<K> } K
 * @typedef { (...args: Parameters<K>) => Promise<ReturnType<K>> } AsyncComponentType 非同期コンポーネントの型
 */

/**
 * @template { (props: CtxPropTypes<K> | undefined, children: unknown) => (GenStateNode | GenStateNodeSet) } K
 * @typedef { ((...args: Parameters<K>) => ReturnType<K>) & { early: true } } PseudoComponentType 擬似コンポーネントの型
 */

/**
 * @template { (a: unknown, b?: unknown, c?: unknown[]) => unknown } T
 * @typedef { undefined extends Parameters<T>[2] ? [] : Parameters<T>[2] } CompChildrenType コンポーネントの子要素の型
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLElement ? {
 * 		clientHeight: HTMLElement['clientHeight'];
 * 		clientWidth: HTMLElement['clientWidth'];
 * } : {} } ObservableHTMLElementState 観測可能なHTMLElement固有の要素の状態
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLInputElement ? {
 * 		value: HTMLInputElement['value'];
 * 		valueAsDate: HTMLInputElement['valueAsDate'];
 * 		valueAsNumber: HTMLInputElement['valueAsNumber'];
 * 		checked: HTMLInputElement['checked'];
 * } : {} } ObservableHTMLInputElementState 観測可能なHTMLInputElement固有の要素の状態
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLSelectElement ? {
 * 		value: HTMLSelectElement['value'];
 * 		selectedOptions: HTMLSelectElement['selectedOptions'];
 * } : {} } ObservableHTMLSelectElement 観測可能なHTMLSelectElement固有の要素(changeイベントリスナで変更を監視する)
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLTextAreaElement ? {
 * 		value: HTMLTextAreaElement['value'];
 * } : {} } ObservableHTMLTextAreaElement 観測可能なHTMLTextAreaElement固有の要素(inputイベントリスナで変更を監視する)
 */

/**
 * @template { string } K
 * @typedef { K extends keyof HTMLElementTagNameMap ? 
 * 		ObservableHTMLElementState<HTMLElementTagNameMap[K]> &
 * 		ObservableHTMLInputElementState<HTMLElementTagNameMap[K]> &
 * 		ObservableHTMLSelectElement<HTMLElementTagNameMap[K]> &
 * 		ObservableHTMLTextAreaElement<HTMLElementTagNameMap[K]>
 * : {} } ObservableDomNodeStates 観測可能なHTML要素の状態
 */

/**
 * @template { ComponentType<K> } K
 * @typedef { ReturnType<K> extends StateNode ? {}
 * 		: 'exposeStates' extends keyof ReturnType<K> ? ReturnType<K>['exposeStates'] extends undefined ? {} : ReturnType<K>['exposeStates']
 * 		: {}
 * } ComponentExposeStates 公開しているコンポーネントの状態
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: ElementTypeOfState<T[K]> } } ObservableComponentStatesImpl
 */

/**
 * @template { ComponentType<K> } K
 * @typedef { ObservableComponentStatesImpl<ComponentExposeStates<K>> } ObservableComponentStates 観測可能なコンポーネントの状態
 */

/**
 * @template T
 * @typedef { Partial<{
* 		[K in keyof T]-?: State<T[K]>;
* }> } ObservableStateImpl 観測可能な状態の型の構築のための共通の変換
*/

/**
 * @template { string | ComponentType<K> } K
 * @typedef { ObservableStateImpl<K extends string ? ObservableDomNodeStates<K> : ObservableComponentStates<K>> } ObservableStates 観測可能な状態
 */

/**
 * @typedef {{
 * 		ctx?: State<Context>;
 * 		node?: State<StateNode>;
 * }} ReferrablePropsInStateNode StateNodeで参照可能な要素
 */

/**
 * @typedef {{
 * 		ctx?: State<Context>;
 * 		set?: State<StateNodeSet>;
 * }} ReferrablePropsInStateNodeSet StateNodeSetで参照可能な要素
 */

/**
 * @typedef {{
 * 		node: StateNode;
 * 		children: { node: GenStateNode; ctx: Context }[];
 * 		element: HTMLElement | Text | undefined;
 * }} BuildCurrentResultType buildCurrentにおける結果型
 */

/**
 * @typedef {{
 * 		ctx: Context;
 * 		node: StateNode;
 * 		children: { node: GenStateNode; ctx: Context }[];
 * 		element: HTMLElement | Text;
 * }} MountComponentResultType mountComponentにおける結果型
 */

/**
 * 状態を持ったノード
 */
class StateNode {
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList;

	/**
	 * コンストラクタ
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(callerList = []) {
		this.callerList = callerList;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	/* istanbul ignore next */
	get element() { throw new Error('not implemented.'); }

	/**
	 * ノードの削除
	 */
	/* istanbul ignore next */
	remove() { throw new Error('not implemented.'); }

	/**
	 * ノードの取り外し
	 */
	/* istanbul ignore next */
	detach() { throw new Error('not implemented.'); }

	/**
	 * ノードの関連付けの開放
	 */
	free() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.callerList = [];
	}
}

/**
 * StateNodeを生成するためのノード
 */
class GenStateNode {
	/** @protected @type { ((node: StateNode, element: HTMLElement | Text | undefined) => unknown)[] } buildCurrent時に同期的に生成したStateNodeを配信するためのコールバックのリスト */
	#deliverStateNodeCallback = [];
	/** @type { ReferrablePropsInStateNode | undefined } 参照する対象 */
	#referrableStates = undefined;
	/** @type { (() => Promise<unknown>)[] } Promiseを生成する関数のリスト */
	#genPromiseList = [];

	/**
	 * ノードの参照を行う
	 * @param { ReferrablePropsInStateNode } props 観測する対象
	 */
	ref(props) {
		this.#referrableStates = props;
		return this;
	}

	/**
	 * buildCurrent時にStateNodeを取得するためのコールバックの指定
	 * @param { (node: StateNode, element: HTMLElement | Text | undefined) => unknown } callback StateNodeを取得するためのコールバック
	 */
	getStateNode(callback) {
		this.#deliverStateNodeCallback.push(callback);
		return this;
	}

	/**
	 * buildCurrent時に構築の待機を行うためのPromiseを生成するコールバックの追加
	 * @param { () => Promise<unknown> } callback Promiseを生成するコールバック
	 */
	addGenPromise(callback) {
		this.#genPromiseList.push(callback);
		return this;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateNode }
	 */
	clone() { throw new Error('not implemented.'); }

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { BuildCurrentResultType }
	 */
	buildCurrentImpl(ctx, target) { throw new Error('not implemented.'); }

	/**
	 * @overload
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @param { 'nowait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { BuildCurrentResultType }
	 */
	/**
	 * @overload
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @param { 'wait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Promise<BuildCurrentResultType> | BuildCurrentResultType }
	 */
	/**
	 * 自要素を構築する
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @param { 'wait' | 'nowait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 */
	buildCurrent(ctx, target, waitFlag) {
		ctx.genStateNode = this;
		const ret = this.buildCurrentImpl(ctx, target);
		ctx.genStateNode = undefined;
		this.#deliverStateNodeCallback.forEach(callback => callback(ret.node, ret.element));
		this.#deliverStateNodeCallback = [];
		if (this.#referrableStates) {
			// 参照の評価
			if (this.#referrableStates.node) {
				this.#referrableStates.node.value = ret.node;
			}
			if (this.#referrableStates.ctx) {
				// コンポーネントなら保持しているコンテキストを渡す
				this.#referrableStates.ctx.value = ret.node instanceof StateComponent ? ret.node.ctx : ctx;
			}
		}
		if (this.#genPromiseList.length > 0) {
			// 蓄積したPromiseの評価を行う
			const PromiseList = this.#genPromiseList.map(callback => callback());
			this.#genPromiseList = [];
			if (waitFlag === 'wait') {
				// Promiseの評価をして次のノードの構築を遅延させる
				return Promise.all(PromiseList).then(() => ret);
			}
		}
		return ret;
	}

	/**
	 * @overload
	 * @param { Context } ctx コンポーネントを構築するコンテキス
	 * @param { GenStateNode } gen コンポーネントを生成する対象
	 * @param { HTMLElement | undefined } element マウントに用いるDOMノード
	 * @param { Set<ICallerLabel> } lockedLabelSet 現在のbuildでロックをかけたラベルのリスト
	 * @param { 'nowait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Generator<BuildCurrentResultType, MountComponentResultType, BuildCurrentResultType> }
	 */
	/**
	 * @overload
	 * @param { Context } ctx コンポーネントを構築するコンテキス
	 * @param { GenStateNode } gen コンポーネントを生成する対象
	 * @param { HTMLElement | undefined } element マウントに用いるDOMノード
	 * @param { Set<ICallerLabel> } lockedLabelSet 現在のbuildでロックをかけたラベルのリスト
	 * @param { 'wait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Generator<BuildCurrentResultType | Promise<BuildCurrentResultType>, MountComponentResultType, BuildCurrentResultType> }
	 */
	/**
	 * コンポーネントに対してマウントを試みる
	 * @param { Context } ctx コンポーネントを構築するコンテキス
	 * @param { GenStateNode } gen コンポーネントを生成する対象
	 * @param { HTMLElement | undefined } element マウントに用いるDOMノード
	 * @param { Set<ICallerLabel> } lockedLabelSet 現在のbuildでロックをかけたラベルのリスト
	 * @param { 'wait' | 'nowait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Generator<BuildCurrentResultType | Promise<BuildCurrentResultType>, MountComponentResultType, BuildCurrentResultType> }
	 */
	*#mountComponent(ctx, gen, element, lockedLabelSet, waitFlag) {
		/** @type { StateComponent | undefined } */
		let prevNode = undefined;
		/** @type { StateComponent[] } */
		const comonentList = [];
		while (gen instanceof GenStateComponent) {
			if (waitFlag === 'wait' && gen instanceof GenStateAsyncComponent) {
				// waitかつ非同期コンポーネントの場合は評価しない(副作用ではないことにより構築されるのを防止)
				gen = new GenStatePlaceholderNode();
				break;
			}
			const { node, children } = yield gen.buildCurrent(ctx, element, waitFlag);
			lockedLabelSet.add(node.ctx.sideEffectLabel);
			if ((prevNode instanceof StateComponent) && !(prevNode instanceof StateAsyncComponent)) {
				comonentList.push(prevNode);
				const prevCtx = prevNode.ctx;
				if (!prevCtx.hasFunctionDelivery && prevCtx.state.lockedCount(prevCtx.sideEffectLabel) === 0) {
					// 副作用はないためロックを解除
					prevCtx.state.unlock([prevCtx.sideEffectLabel]);
					lockedLabelSet.delete(prevCtx.sideEffectLabel);
				}
			}
			// コンポーネントの子は1つのみかつ必ず存在する
			gen = children[0].node;
			ctx = children[0].ctx;
			prevNode = node;
		}
		// elementが与えられたならばこのタイミングでマウントされる
		const ret = yield gen.buildCurrent(ctx, element, waitFlag);
		// コンポーネントを示すDOMノードが構築された段階でonMountを発火
		comonentList.forEach(node => node.onMount());
		return { ctx, ...ret };
	}

	/**
	 * @overload
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 * @param { 'nowait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Generator<BuildCurrentResultType, { labelSet: Set<ICallerLabel>; node: StateNode; element: HTMLElement | Text; }, BuildCurrentResultType> }
	 */
	/**
	 * @overload
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 * @param { 'wait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Generator<BuildCurrentResultType | Promise<BuildCurrentResultType>, { labelSet: Set<ICallerLabel>; node: StateNode; element: HTMLElement | Text; }, BuildCurrentResultType> }
	 */
	/**
	 * DOMノードにマウントする
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 * @param { 'wait' | 'nowait' } waitFlag 蓄積したPromiseを処理する方式の指定
	 * @returns { Generator<BuildCurrentResultType | Promise<BuildCurrentResultType>, { labelSet: Set<ICallerLabel>; node: StateNode; element: HTMLElement | Text; }, BuildCurrentResultType> }
	 */
	*#mountImpl(ctx, target, waitFlag) {
		/** @type { undefined | StateNode } */
		let resuleNode = undefined;
		this.getStateNode(node => resuleNode = node);
		/** @type { Set<ICallerLabel> } */
		const lockedLabelSet = new Set();

		// ルート要素配下のコンポーネント以外で生じた副作用の評価を遅延するためにロック
		if (!ctx.state.locked(ctx.sideEffectLabel)) {
			ctx.state.lock([ctx.sideEffectLabel]);
			lockedLabelSet.add(ctx.sideEffectLabel);
		}

		// イベント制御が不要なコンポーネントとして退避
		const rootComponent = ctx.component;

		const ret = yield* this.#mountComponent(ctx, this, target, lockedLabelSet, waitFlag);

		/** @type { MountComponentResultType[] } コンポーネントについての幅優先探索に関するキュー */
		const queueComponent = [ret];
		
		while (queueComponent.length > 0) {
			/** @type { (typeof queueComponent)[number] } */
			const { ctx, node, children, element: localRoot } = queueComponent.shift();
			/** @type {{ node: StateNode; children: (GenStateComponent | { node: GenStateNode; ctx: Context; element: HTMLElement | Text | undefined; })[]; element: HTMLElement | Text }} コンポーネント内におけるStateNodeのツリー(コンポーネントはGenStateNodeで管理) */
			const localTree = { node, children, element: localRoot };
			/** @type { (typeof localTree)[] } ノードについての幅優先探索に関するキュー */
			const queueNode = [localTree];

			//  コンポーネント内のノード生成に関するループ
			while (queueNode.length > 0) {
				/** @type { (typeof queueNode)[number] } */
				const { children, element } = queueNode.shift();
				if (children.length === 0) {
					continue;
				}
				// 子要素の評価と取り出し
				const childNodes = element?.childNodes ?? [];
				// nodeに子が設定されているときはElementノード以外を削除
				for (const childNode of [...childNodes]) {
					if (childNode.nodeType !== ctx.window.Node.ELEMENT_NODE) {
						childNode.remove();
					}
				}
				const useChildNodes = childNodes.length > 0;
				let cnt = 0;
				// 子要素の評価
				for (let i = 0; i < children.length; ++i) {
					/** @type { { node: GenStateNode; ctx: Context } } */
					const { node: gen, ctx: childCtx } = children[i];
					const childNode = cnt < childNodes.length ? childNodes[cnt++] : undefined;
					// ノードの比較を実施(genはundefinedにはならない)
					if (gen instanceof GenStateComponent) {
						if (gen instanceof GenStateAsyncComponent) {
							// GenStateAsyncComponentの場合はplaceholderを生成するため戻る
							--cnt;
						}
						else {
							if (useChildNodes && !childNode) {
								throw new Error('The number of nodes is insufficient.');
							}
						}
						// 子要素をコンポーネントを生成するノードで置き換え
						children[i] = gen;
					}
					else {
						if (gen instanceof GenStateTextNode || gen instanceof GenStatePlaceholderNode) {
							const { node, element: genElement } = yield gen.buildCurrent(childCtx, undefined, waitFlag);
							// 子要素をStateNodeで置き換え
							children[i] = { node, children: [], element: genElement };
							// テキストノードもしくはplaceholderであれば挿入して補完する
							if (useChildNodes) {
								element.insertBefore(genElement, childNode);
							}
						}
						else {
							if (useChildNodes && !childNode) {
								throw new Error('The number of nodes is insufficient.');
							}
							const { node, children: _children, element: genElement } = yield gen.buildCurrent(childCtx, childNode, waitFlag);
							// localTreeの構築
							children[i] = { node, children: _children, element: genElement };
							queueNode.push(children[i]);
						}
					}
				}
				// 子要素が多すぎたかの評価
				if (useChildNodes && cnt + 1 < childNodes.length) {
					throw new Error('The number of nodes is excessive.');
				}
			}

			// DOMノードの親子関係の決定
			queueNode.push(localTree);
			while (queueNode.length > 0) {
				/** @type { (typeof queueNode)[number] } */
				const { node, children, element } = queueNode.shift();
				const parent = element;
				let childNode = element?.firstChild;
				for (let i = 0; i < children.length; ++i) {
					const child = children[i];
					let node = undefined;
					let element = undefined;
					// GenStateComponentの場合はカレントノードを構築する
					if (child instanceof GenStateComponent) {
						const ret = yield* this.#mountComponent(ctx, child, childNode, lockedLabelSet, waitFlag);
						node = ret.node;
						element = ret.element;
						if (child instanceof GenStateAsyncComponent) {
							// StateAsyncComponentの場合はplaceholderで補完されるため次のchildNodeへ移動しないようにする
							parent.insertBefore(element, childNode);
							continue;
						}
						queueComponent.push(ret);
					}
					else {
						node = child.node;
						element = /** @type { HTMLElement | Text } */(child.element);
					}
					// elementに子要素が存在しない場合にのみ子を追加する
					if (!childNode) {
						parent.appendChild(element);
					}
					// GenStateComponentでない場合は次の探索のセットアップ
					if (!(child instanceof GenStateNode)) {
						queueNode.push(child);
					}
					childNode = childNode?.nextSibling;
				}
			}

			const component = ctx.component;
			if (component !== rootComponent) {
				if (!(component instanceof StateAsyncComponent)) {
					// コンポーネント配下のコンポーネントが構築完了したためonMountを発火
					component.onMount();
				}
			}
			if (lockedLabelSet.has(ctx.sideEffectLabel) && !ctx.hasFunctionDelivery && ctx.state.lockedCount(ctx.sideEffectLabel) === 0) {
				// 副作用はないためロックを解除
				ctx.state.unlock([ctx.sideEffectLabel]);
				lockedLabelSet.delete(ctx.sideEffectLabel);
			}
		}
		return { labelSet: lockedLabelSet, node: resuleNode, element: ret.element };
	}

	/**
	 * 子孫要素を構築する
	 * @param { Context | undefined } ctx ノードを生成する場所
	 */
	build(ctx = undefined) {
		ctx = ctx ?? new Context(window);
		ctx.waitFlag = 'nowait';
		const generator = this.#mountImpl(ctx, undefined, ctx.waitFlag);
		let arg = undefined;
		while (true) {
			const { done, value } = generator.next(arg);

			if (done) {
				ctx.state.unlock(value.labelSet)();
				return { node: value.node, element: value.element };
			}
			arg = value;
		}
	}
	
	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement } target マウント対象のDOMノード
	 * @param { Context | undefined } ctx ノードを生成する場所
	 */
	mount(target, ctx = undefined) {
		ctx = ctx ?? new Context(window);
		ctx.waitFlag = 'nowait';
		const generator = this.#mountImpl(ctx, target, ctx.waitFlag);
		let arg = undefined;
		while (true) {
			const { done, value } = generator.next(arg);

			if (done) {
				ctx.state.unlock(value.labelSet)();
				return ctx;
			}
			arg = value;
		}
	}

	/**
	 * 後からマウント可能なDOMノードを構築する
	 * @param { HTMLElement | undefined } target 書き込み対象のDOMノード
	 * @param { Context | undefined } ctx ノードを生成する場所
	 */
	async write(target, ctx = undefined) {
		ctx = ctx ?? new Context(window);
		ctx.waitFlag = 'wait';
		const generator = this.#mountImpl(ctx, target, ctx.waitFlag);
		let arg = undefined;
		while (true) {
			const { done, value } = generator.next(arg);

			if (done) {
				// 変更の伝播を破棄する
				ctx.state.unlock(value.labelSet);
				return ctx;
			}
			arg = value instanceof Promise ? await value : value;
		}
	}
}

/**
 * ノードの集合
 */
class StateNodeSet {
	/** @protected @type { (StateNode | StateNodeSet)[] } 管理しているネストを許容したノードの集合 */
	nestedNodeSet = [];

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンテキスト
	 * @param { (GenStateNode | GenStateNodeSet)[] } nestedNodeSet ネストを許容したノードの集合
	 * @param { { node: GenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 */
	constructor(ctx, nestedNodeSet, sibling) {
		for (const nestedNode of nestedNodeSet) {
			if (nestedNode instanceof GenStateNode) {
				// GenStateNodeの場合は後からノードをセットされるようにする
				this.nestedNodeSet.push(undefined);
				const i = this.nestedNodeSet.length - 1;
				nestedNode.getStateNode(node => this.nestedNodeSet[i] = node);
				sibling.push({ node: nestedNode, ctx });
			}
			else {
				// GenStateNodeSetの場合はそれを評価してノードをセットする
				const { set, sibling: sibling_ } = nestedNode.buildStateNodeSet(ctx);
				this.nestedNodeSet.push(set);
				sibling.push(...sibling_);
			}
		}
	}

	/**
	 * ノードの集合の内最初のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get first() {
		if (this.nestedNodeSet.length === 0) {
			return undefined;
		}
		const node = this.nestedNodeSet[0];
		return node instanceof StateNode ? node : node.first;
	}

	/**
	 * ノードの集合の内最後のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get last() {
		if (this.nestedNodeSet.length === 0) {
			return undefined;
		}
		const node = this.nestedNodeSet[this.nestedNodeSet.length - 1];
		return node instanceof StateNode ? node : node.last;
	}

	/**
	 * StateNode全体を取得する
	 * @returns { Generator<StateNode, void, unknown> }
	 */
	*nodeSet() {
		for (const nestedNode of this.nestedNodeSet) {
			if (nestedNode instanceof StateNode) {
				yield nestedNode;
			}
			else {
				yield* nestedNode.nodeSet();
			}
		}
	}

	/**
	 * ノードの挿入
	 * @param { HTMLElement | Text | undefined } element 挿入を行う前の要素
	 * @param { HTMLElement } parent 挿入を行う親要素
	 */
	insertBefore(element, parent) {
		for (const node of this.nodeSet()) {
			const nodeElement = node.element;
			if (nodeElement === element) {
				// 'HTMLElement | Text | undefined'を満たすことを前提とする
				element = element?.nextSibling;
			}
			else {
				parent.insertBefore(nodeElement, element);
			}
		}
		return element;
	}

	/**
	 * ノードの削除
	 */
	remove() {
		for (const node of this.nodeSet()) {
			node.remove();
		}
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		for (const node of this.nodeSet()) {
			node.detach();
		}
	}

	/**
	 * ノードの関連付けの開放
	 */
	free() {
		for (const node of this.nodeSet()) {
			node.free();
		}
	}
}

/**
 * ノードの集合を生成するためのノードの集合
 */
class GenStateNodeSet {
	/** @protected @type { (GenStateNode | GenStateNodeSet)[] } 管理しているネストを許容したノードの集合 */
	nestedNodeSet;
	/** @protected @type { ((node: StateNodeSet) => unknown)[] } buildCurrent時に同期的に生成したStateNodeを配信するためのコールバックのリスト */
	#deliverStateNodeSetCallback = [];
	/** @type { ReferrablePropsInStateNodeSet | undefined } 参照する対象 */
	#referrableStates = undefined;

	/**
	 * コンストラクタ
	 * @param { (GenStateNode | GenStateNodeSet)[] } nestedNodeSet ネストを許容したノードの集合
	 */
	constructor(nestedNodeSet) {
		this.nestedNodeSet= nestedNodeSet;
	}

	/**
	 * ノードの参照を行う
	 * @param { ReferrablePropsInStateNodeSet } props 観測する対象
	 */
	ref(props) {
		this.#referrableStates = props;
		return this;
	}

	/**
	 * buildStateNodeSet時にStateNodeSetを取得するためのコールバックの指定
	 * @param { (node: StateNodeSet) => unknown } callback StateNodeを取得するためのコールバック
	 */
	getStateNodeSet(callback) {
		this.#deliverStateNodeSetCallback.push(callback);
		return this;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @protected
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; ctx: Context; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSetImpl(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new StateNodeSet(ctx, this.nestedNodeSet, sibling);
		return { set, ctx, sibling };
	}

	/**
	 * 保持しているノードの取得と構築
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; ctx: Context; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		const ret = this.buildStateNodeSetImpl(ctx);
		this.#deliverStateNodeSetCallback.forEach(callback => callback(ret.set));
		this.#deliverStateNodeSetCallback = [];
		if (this.#referrableStates) {
			// 参照の評価
			if (this.#referrableStates.set) {
				this.#referrableStates.set.value = ret.set;
			}
			if (this.#referrableStates.ctx) {
				this.#referrableStates.ctx.value = ret.ctx;
			}
		}
		return ret;
	}
}

/**
 * 状態を持ったTextノード
 */
class StateTextNode extends StateNode {
	/** @type { Text } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { Text } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(element, callerList) {
		super(callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { Text | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.#element.remove();
		this.callerList = [];
		this.#element = undefined;
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		this.#element.remove();
	}
}

/**
 * StateTextNodeを生成するためのノード
 */
class GenStateTextNode extends GenStateNode {
	/** @type { CtxValueType<string> } テキスト要素 */
	#text;

	/**
	 * コンストラクタ
	 * @param { CtxValueType<string> } text テキスト
	 */
	constructor(text) {
		super();
		this.#text = text;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateTextNode }
	 */
	clone() {
		return new GenStateTextNode(this.#text);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { BuildCurrentResultType }
	 */
	buildCurrentImpl(ctx, target) {
		// ノードのチェック
		if (target) {
			if (target.nodeType !== ctx.window.Node.TEXT_NODE) {
				throw new Error('\'target\' must be an Text.');
			}
		}
		const text = this.#text;
		const element = target ?? ctx.window.document.createTextNode('');
		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		// 子にテキストの状態が渡された場合は変更を監視する
		const caller = setParam(text, val => element.data = val, ctx.domUpdateLabel);
		if (caller && caller.states.length > 0) callerList.push(caller);

		return { node: new StateTextNode(element, callerList), children: [], element };
	}
}

/**
 * placeholderを示すノード
 */
class StatePlaceholderNode extends StateNode {
	/** @type { Text } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { Text } element DOMノード
	 */
	constructor(element) {
		super();
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { Text | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.#element.remove();
		this.callerList = [];
		this.#element = undefined;
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		this.#element.remove();
	}
}

/**
 * StatePlaceholderNodeを生成するためのノード
 */
class GenStatePlaceholderNode extends GenStateNode {
	/**
	 * コンストラクタ
	 */
	constructor() {
		super();
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStatePlaceholderNode }
	 */
	clone() {
		return new GenStatePlaceholderNode();
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { BuildCurrentResultType }
	 */
	buildCurrentImpl(ctx, target) {
		const element = ctx.window.document.createTextNode('');
		return { node: new StatePlaceholderNode(element), children: [], element };
	}
}

/**
 * 状態を持ったHTMLElementノード
 */
class StateHTMLElement extends StateNode {
	/** @type { HTMLElement } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { HTMLElement } element DOMノード
	 */
	constructor(element) {
		super();
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.#element.remove();
		this.callerList = [];
		this.#element = undefined;
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		this.#element.remove();
	}
}

/**
 * StateHTMLElementを生成するためのノード
 */
class GenStateHTMLElement extends GenStateNode {
	/** @type { HTMLElement } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { HTMLElement } element DOMノード
	 */
	constructor(element) {
		super();
		this.#element = element;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateHTMLElement }
	 */
	clone() {
		return new GenStateHTMLElement(this.#element);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { BuildCurrentResultType }
	 */
	buildCurrentImpl(ctx, target) {
		// ノードのチェック
		if (target) {
			if (target.nodeType === ctx.window.Node.TEXT_NODE) {
				throw new Error('\'target\' must be an HTMLElement.');
			}
			else if (target.tagName.toLowerCase() !== this.#element.tagName.toLowerCase()) {
				throw new Error(`'${target.tagName}' and '${this.#element.tagName}' cannot build a node because they have different tag names.`)
			}
		}

		if (target && target !== this.#element) {
			// 属性を移動
			for (const attribute of this.#element.attributes) {
				if (!target.hasAttribute(attribute.name)) {
					target.setAttribute(attribute.name, attribute.value);
				}
			}
			return { node: new StateHTMLElement(target), children: [], element: target };
		}

		return { node: new StateHTMLElement(this.#element), children: [], element: this.#element };
	}
}

/**
 * 状態を持ったDOMノード
 * @template { string } K
 */
class StateDomNode extends StateNode {
	/** @type { CreatedElementType<K> } DOMノード */
	#element = undefined;

	/**
	 * コンストラクタ
	 * @param { HTMLElement } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(element, callerList) {
		super(callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.#element.remove();
		this.callerList = [];
		this.#element = undefined;
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		this.#element.remove();
	}
}

/**
 * 状態の伝播に関する参照情報の設定
 * @template { string } K
 * @param { ObservableStates<K> } props 観測する対象
 * @param { string } targets 監視対象のパラメータ
 * @param { (key: string) => (state: State<unknown>) => void } callback onreferenceに設定するコールバック
 */
function setReference(props, targets, callback) {
	for (const name of targets) {
		/** @type { State<unknown> | undefined } */
		const state = props[name];
		if (state) {
			state.onreference = callback(name);
		}
	}
};

/**
 * オブザーバによる状態の伝播に関する参照情報の設定
 * @template { string } K
 * @param { HTMLElement } element 観測する対象をもつ要素
 * @param { (setter: (element: HTMLElement) => void) => void } observer イベントリスナのタイプ
 * @param { ObservableStates<K> } props 観測する対象
 * @param { string[] } targets 監視対象のパラメータ
 */
function setReferenceToObserver(element, observer, props, targets) {
	let callbackEventListenerFlag = true;
	/**
	 * イベントの構築
	 * @param { string } key
	 * @returns { (state: State<unknown>) => void }
	 */
	const callbackEventListener = key => state => {
		// 初回呼び出し時にのみイベントを設置する
		if (callbackEventListenerFlag) {
			callbackEventListenerFlag = !callbackEventListenerFlag;
			observer(element => {
				// 各種状態の設定
				for (const name of targets) {
					/** @type { State<unknown> | undefined } */
					const state = props[name];
					const value = element[name];
					if (state && state.org !== value) {
						state.value = value;
					}
				}
			});
		}
		// 初期値の伝播
		state.value = element[key];
	};

	// 状態の監視の設定
	setReference(props, targets, callbackEventListener);
};

/**
 * イベントリスナのオブザーバによる状態の伝播に関する参照情報の設定
 * @template { string } K
 * @template { HTMLElementEventMap } L
 * @param { HTMLElement } element 観測する対象をもつ要素
 * @param { L } type イベントリスナのタイプ
 * @param { ObservableStates<K> } props 観測する対象
 * @param { string[] } targets 監視対象のパラメータ
 */
function setReferenceToEventListenerObserver(element, type, props, targets) {
	setReferenceToObserver(element, setter => {
		element.addEventListener(type, e => setter(e.target));
	}, props, targets);
};

/**
 * StateDomNodeを生成するためのノード
 * @template { string } K
 */
class GenStateDomNode extends GenStateNode {
	/** @type { K } HTMLタグ */
	#tag;
	/** @type { CtxDomPropTypes<CreatedElementType<K>> } プロパティ */
	#props;
	/** @type { (GenStateNode | GenStateNodeSet)[] } 子要素 */
	#children;
	/** @type { ObservableStates<K> | undefined } 観測する対象 */
	#observableStates = undefined;
	/** @type { boolean } ノードが生成されたことがあるかを示すフラグ */
	#genFlag = false;

	/**
	 * コンストラクタ
	 * @param { K } tag HTMLタグ
	 * @param { CtxDomPropTypes<CreatedElementType<K>> } props プロパティ
	 * @param { (GenStateNode | GenStateNodeSet)[] } children 子要素
	 */
	constructor(tag, props, children) {
		super();
		this.#tag = tag;
		this.#props = props;
		this.#children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateDomNode<K> }
	 */
	clone() {
		return new GenStateDomNode(this.#tag, this.#props, this.#children);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { BuildCurrentResultType }
	 */
	buildCurrentImpl(ctx, target) {
		// 観測を行う同一ノードの2回以上の生成は禁止
		if (this.#genFlag && this.#observableStates) {
			throw new Error('The buildCurrent in GenStateDomNode must not be called more than twice.');
		}

		// ノードのチェック
		if (target) {
			if (target.nodeType === ctx.window.Node.TEXT_NODE) {
				throw new Error('\'target\' must be an HTMLElement.');
			}
			else if (target.tagName.toLowerCase() !== this.#tag.toLowerCase()) {
				throw new Error(`'${target.tagName}' and '${this.#tag}' cannot build a node because they have different tag names.`)
			}
		}

		// DOMノードの生成
		const element = target ?? ctx.window.document.createElement(this.#tag);

		// 返却するノード
		const node = new StateDomNode(element, []);

		// StateDomとDOM更新を対応付けるラベルの生成
		const domUpdateLabel = ctx.domUpdateLabel;

		// プロパティの設定
		for (const key in this.#props) {
			const _val = this.#props[key];
			if (_val !== undefined && _val !== null && _val !== false) {
				/** @type { boolean | undefined } 属性として設定を行うかのフラグ */
				let attrFlag = undefined;
				const caller = setParam(_val, val => {
					// 属性とプロパティで動作に差異のある対象の設定
					const lowerTag = this.#tag.toLowerCase();
					// styleはオブジェクト型による設定を許容するため処理を特殊化
					if (key === 'style') {
						if (val !== undefined && val !== null && val !== false) {
							for (const styleKey in val) {
								const caller = setParam(
									val[styleKey],
									val => element.style.setProperty(styleKey, val ?? ''),
									domUpdateLabel
								);
								if (caller && caller.states.length > 0) node.callerList.push(caller);
							}
						}
						else {
							element.removeAttribute('style');
						}
					}
					// 属性が初期値を設定するものならば属性の設定を優先する
					else if (
						lowerTag === 'input' && key === 'value' ||
						lowerTag === 'input' && key === 'checked' ||
						lowerTag === 'option' && key === 'selected'
					) {
						if (element.hasAttribute(key)) {
							element[key] = val;
						}
						else {
							// 初期値の設定
							element.setAttribute(key, val);
						}
					}
					else {
						if (attrFlag === undefined) {
							// プロトタイプを走査して書き込み可能なプロパティが存在するかを確認する
							let proto = Object.getPrototypeOf(element);
							while (proto) {
								const desc = Object.getOwnPropertyDescriptor(proto, key);
								if (desc) {
									attrFlag = !!(desc.writable || (!desc.set && desc.get));
									break;
								}
								proto = Object.getPrototypeOf(proto);
							}
							attrFlag = attrFlag ?? true;
						}
						if (attrFlag) {
							// 属性に設定する
							if (val) {
								if (_val instanceof Function) {
									// 関数を設定する場合はエラーハンドリングを行うようにする
									element.setAttribute(key, createWrapperFunction(val, ctx.component));
									// コンポーネントへ副作用が生じる可能性のある処理が伝播されることを通知する
									ctx.notifyFunctionDelivery();
								}
								else {
									element.setAttribute(key, val);
								}
							}
							else {
								element.removeAttribute(key);
							}
						}
						else {
							// プロパティに設定する
							if (_val instanceof Function) {
								// 関数を設定する場合はエラーハンドリングを行うようにする
								element[key] = createWrapperFunction(val, ctx.component);
								// コンポーネントへ副作用が生じる可能性のある処理が伝播されることを通知する
								ctx.notifyFunctionDelivery();
							}
							else {
								element[key] = val ?? '';
							}
						}
					}
				}, domUpdateLabel);
				if (caller && caller.states.length > 0) node.callerList.push(caller);
			}
		}

		// 子要素の構築
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const children = [];
		for (const child of  this.#children) {
			if (child instanceof GenStateNode) {
				children.push({ node: child, ctx });
			}
			else {
				children.push(...child.buildStateNodeSet(ctx).sibling);
			}
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(ctx, this.#observableStates, element);
		}

		this.#genFlag = true;

		return { node, children, element };
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		// 既にobserve()が呼びだされたことがあるのならばノードを複製する
		const node = this.#observableStates ? this.clone() : this;
		node.#observableStates = props;
		node.#genFlag = false;
		return node;
	}

	/**
	 * ノードの内部の状態の観測の実装部
	 * @param { Context } ctx ノードを生成する場所
	 * @param { ObservableStates<K> } props 観測する対象
	 * @param { HTMLElement } element 観測する対象をもつ要素
	 */
	#observeImpl(ctx, props, element) {
		//
		// HTMLElementに関する項目の検証
		//
		{
			setReferenceToObserver(element, setter => {
				const resizeObserver = new ResizeObserver(entries => setter(element));
				resizeObserver.observe(element);
			}, props, ['clientHeigth', 'clientWidth']);
		}

		//
		// HTMLInputElementに関する項目の検証
		//
		if (element instanceof ctx.window.HTMLInputElement) {
			setReferenceToEventListenerObserver(element, 'input', props, ['value', 'valueAsDate', 'valueAsNumber']);
			setReferenceToEventListenerObserver(element, 'change', props, ['checked']);
		}

		//
		// HTMLSelectElementに関する項目の検証
		//
		if (element instanceof ctx.window.HTMLSelectElement) {
			setReferenceToEventListenerObserver(element, 'change', props, ['value', 'selectedOptions']);
		}

		//
		// HTMLTextAreaElementに関する項目の検証
		//
		if (element instanceof ctx.window.HTMLTextAreaElement) {
			setReferenceToEventListenerObserver(element, 'input', props, ['value']);
		}
	}
}

/**
 * コンポーネント
 * @template { ComponentType<K> } K
 */
class StateComponent extends StateNode {
	/** @type { Context } コンポーネントを示すコンテキスト */
	#ctx;
	/** @type { StateComponent<unknown> | undefined } 親コンポーネント */
	#parent = undefined;
	/** @protected @type { GenStateNode } nodeを生成するノード */
	genStateNode;
	/** @protected @type { StateNode | undefined } コンポーネントを代表するノード */
	node = undefined;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K2> } K2
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K2> | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, parent, callerList) {
		super(callerList);
		this.#ctx = ctx;
		this.#parent = parent;
	}

	/**
	 * コンポーネントを示すコンテキストの取得
	 */
	get ctx() { return this.#ctx; }

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { return this.node?.element; }

	/**
	 * 親コンポーネントの取得
	 */
	get parent() { return this.#parent; }

	/**
	 * コンポーネントを構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return { GenStateNode }
	 */
	build(target, component, props, children, observableStates) {
		this.#ctx.state.lock([this.#ctx.sideEffectLabel]);

		// コンポーネントを示す関数内でコンテキストを介してctx.component.elementでDOMノードを参照できるようにセットアップする
		if (target?.nodeType === this.#ctx.window.Node.ELEMENT_NODE) {
			this.node = new StateHTMLElement(target);
		}

		// ノードの生成
		try {
			this.genStateNode = this.#ctx.buildComponent(component, props, children, observableStates, this.callerList);
		}
		catch (e) {
			// 状態変数の関連付けを破棄してから例外をリスロー
			this.remove();
			throw e;
		}

		return this.genStateNode.getStateNode(node => this.node = node);
	}

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.node?.remove();
		this.callerList = [];
		this.onUnmount();
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		this.node?.detach();
	}

	onMount() {
		if (this.#ctx.lifecycle.onMount) {
			this.#ctx.state.update(this.#ctx.lifecycle.onMount);
		}
	}

	onUnmount() {
		if (this.#ctx.lifecycle.onUnmount) {
			this.#ctx.state.update(this.#ctx.lifecycle.onUnmount);
		}
	}

	onBeforeUpdate() {
		if (this.#ctx.lifecycle.onBeforeUpdate) {
			this.#ctx.state.update(this.#ctx.lifecycle.onBeforeUpdate);
		}
	}

	onAfterUpdate() {
		if (this.#ctx.lifecycle.onAfterUpdate) {
			this.#ctx.state.update(this.#ctx.lifecycle.onAfterUpdate);
		}
	}

	/**
	 * @param { unknown } error throwされた要素
	 * @param { StateComponent<unknown> } component throwが実行されたコンポーネント
	 * @param { number } handledTimes エラーがハンドルされた回数
	 */
	onErrorCaptured(error, component, handledTimes = 0) {
		/** @type { boolean }  */
		let prop = true;
		if (this.#ctx.lifecycle.onErrorCaptured) {
			prop = false;
			// 遅延評価せず即時に評価する
			for (const callback of this.#ctx.lifecycle.onErrorCaptured) {
				const val = callback(error, component);
				if (val !== false) {
					prop = true;
				}
			}
			handledTimes += this.#ctx.lifecycle.onErrorCaptured.length;
		}

		if (prop) {
			// 親コンポーネントにエラーを伝播する
			if (this.#parent) {
				this.#parent.onErrorCaptured(error, component, handledTimes);
			}
			// ハンドルされない場合は例外をリスロー
			else if (handledTimes <= 0) {
				throw error;
			}
		}
	}
}

/**
 * StateComponentを生成するためのノード
 * @template { ComponentType<K> } K
 */
class GenStateComponent extends GenStateNode {
	/** @protected @type { Function } コンポーネントを示す関数 */
	component;
	/** @protected @type { CtxPropTypes<K> } プロパティ */
	props;
	/** @protected @type { CompChildrenType<K> } 子要素 */
	children;
	/** @protected @type { ObservableStates<K> | undefined } 観測する対象 */
	observableStates = undefined;
	/** @type { boolean } ノードが生成されたことがあるかを示すフラグ */
	#genFlag = false;

	/**
	 * コンストラクタ
	 * @param { K } component コンポーネントを示す関数
	 * @param { CtxPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 */
	constructor(component, props, children) {
		super();
		this.component = component;
		this.props = props;
		this.children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateComponent<K> }
	 */
	clone() {
		return new GenStateComponent(this.component, this.props, this.children);
	}

	/**
	 * StateComponentの生成
	 * @param { Context } ctx コンポーネントが属することになるコンテキスト
	 * @param { StateComponent | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	generateStateComponent(ctx, parent, callerList) {
		return new StateComponent(ctx, parent, callerList);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { BuildCurrentResultType }
	 */
	buildCurrentImpl(ctx, target) {
		// 観測を行う同一ノードの2回以上の生成は禁止
		if (this.#genFlag && this.observableStates) {
			throw new Error('The buildCurrent in GenStateComponent must not be called more than twice.');
		}

		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		/** 生成するコンポーネントが属するコンテキストとそのコンポーネント */
		const node = ctx.generateContextForComponent(_ctx => this.generateStateComponent(_ctx, ctx.component, callerList)).component;

		/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
		const compProps = {};
		// プロパティは観測を行うような単方向データに変換して渡すようにする
		const normalizeProps = normalizeCtxProps(this.component, this.props, node);
		for (const key in normalizeProps) {
			const { state, caller } = normalizeProps[key].observe(ctx.state);
			if (caller && caller.states.length > 0) callerList.push(caller);
			compProps[key] = state;
		}

		// コンポーネントを構築して返す
		node.ctx.genStateNode = this;
		const gen = node.build(target, this.component, compProps, this.children, this.observableStates);
		node.ctx.genStateNode = undefined;
		this.#genFlag = true;

		return { node, children: [{ node: gen, ctx: node.ctx }], element: undefined };
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		// 既にobserve()が呼びだされたことがあるのならばノードを複製する
		const node = this.observableStates ? this.clone() : this;
		node.observableStates = props;
		node.#genFlag = false;
		return node;
	}
}

/**
 * 非同期コンポーネント
 * @template { ComponentType<K> } K
 */
class StateAsyncComponent extends StateComponent {
	/** @type { Promise } */
	#finished;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K2> } K2
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K2> | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, parent, callerList) {
		super(ctx, parent, callerList);
		this.#finished = Promise.reject(() => new Error('Not yet initialized.'));
		this.#finished.catch(() => {});
	}

	/**
	 * 非同期コンポーネントの生成に関する終了状態のPromiseの取得
	 */
	get finished() {
		return this.#finished;
	}

	/**
	 * コンポーネントを構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return {{ gen: GenStateNode; children: GenStateNode[] }}
	 */
	build(target, component, props, children, observableStates) {
		this.ctx.state.lock([this.ctx.sideEffectLabel]);

		let prevElement = undefined;

		// コンポーネントの構築を行う関数
		const buildAsyncComponent = async () => {
			// コンポーネントを示す関数内でコンテキストを介してctx.component.elementでDOMノードを参照できるようにセットアップする
			if (target?.nodeType === this.ctx.window.Node.ELEMENT_NODE) {
				this.node = new StateHTMLElement(target);
			}

			try {
				this.genStateNode = await this.ctx.buildAsyncComponent(component, props, children, observableStates, this.callerList);
			}
			catch (e) {
				// 状態変数の関連付けを破棄してから例外をリスロー
				super.remove();
				throw e;
			}

			// 葉まで構築して手動でonMountを発火
			const { node, element } = this.genStateNode.build(this.ctx);
			// GenStatePlaceholderNodeから非同期コンポーネントで生成したノードに置き換える
			this.node = node;
			(/** @type { Text } */(prevElement)).replaceWith(element);
			this.onMount();
		};

		// コンポーネントの構築はバックグラウンドで実行
		this.#finished = this.ctx.capture(buildAsyncComponent);

		// 初期表示はplaceholder固定
		return (new GenStatePlaceholderNode()).getStateNode((node, e) => {
			this.node = node;
			prevElement = /** @type { Text } */(e);
		});
	}
}

/**
 * StateAsyncComponentを生成するためのノード
 * @template { ComponentType<K> } K
 */
class GenStateAsyncComponent extends GenStateComponent {

	/**
	 * コンストラクタ
	 * @param { AsyncComponentType<K> } component コンポーネントを示す関数
	 * @param { CtxPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 */
	constructor(component, props, children) {
		super(component, props, children);
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateAsyncComponent<K> }
	 */
	clone() {
		return new GenStateAsyncComponent(this.component, this.props, this.children);
	}

	/**
	 * StateComponentの生成
	 * @param { Context } ctx コンポーネントが属することになるコンテキスト
	 * @param { StateComponent | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */	
	generateStateComponent(ctx, parent, callerList) {
		return new StateAsyncComponent(ctx, parent, callerList);
	}
}

/**
 * @template T1, T2
 * @typedef { (<T>() => (T extends T1 ? 1 : 2)) extends (<T>() => (T extends T2 ? 1 : 2)) ? true : false } IsSame 同じ型であることの判定
 */

/**
 * @template T
 * @typedef { Pick<T, {
 * 		[K in keyof T]-?: IsSame<{ [K2 in K]: T[K2] }, { -readonly [K2 in K]: T[K2] }> extends true ? K : never;
 * }[keyof T]> } RemoveReadonlyProperty 型からreadonlyなプロパティの除去
 */

/**
 * @template T
 * @typedef { Pick<T, {
 * 		[K in keyof T]-?: T[K] extends Function ? never : K;
 * }[keyof T]> } RemoveFunction 型から関数の除去(propertyとprototypeは区別不可)
 */

/**
 * @template T
 * @typedef { IState<T> | T } CtxValueType コンテキスト上での値の型
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: CtxValueType<T[K] | null | undefined> } } CtxPropTypesImpl コンテキスト上でのプロパティの型の連想配列を構成する部分
 */

/**
 * @template { string } T
 * @typedef { T extends `${infer T1}${infer T2}${infer T3}`
 * 		? T2 extends ('-' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9') ? `${Uncapitalize<T1>}${CamelToKebab<`${T2}${T3}`>}`
 * 		: T2 extends Capitalize<T2>
 * 			? `${Uncapitalize<T1>}-${CamelToKebab<`${Uncapitalize<T2>}${T3}`>}`
 * 			: `${Uncapitalize<T1>}${CamelToKebab<`${T2}${T3}`>}`
 * 		: T } CamelToKebab キャメルケースの文字列をケバブケースの文字列へ変換
 */

/**
 * @template { Record<T, unknown> } T
 * @typedef {{ [K in keyof T as CamelToKebab<string & K>]: T[K]; }} CamelToKebabObject オブジェクトのキーをキャメルケースからケバブケースへ変換
 */

/**
 * @template { HTMLElement } T
 * @typedef { CtxPropTypesImpl<
 * 		RemoveReadonlyProperty<RemoveFunction<T>> &
 * 		{ style: CtxPropTypesImpl<CamelToKebabObject<RemoveReadonlyProperty<RemoveFunction<CSSStyleDeclaration>>> & Record<string, string>> }
 * > } CtxDomPropTypes コンテキスト上でのDOMのプロパティの型
 */

/**
 * @template { string | ComponentType<K> } K
 * @typedef { K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K> } CtxPropTypes コンテキスト上でのプロパティの型
 */

/**
 * @template { Record<unknown, unknown> } T
 * @typedef {{ [K in keyof T as undefined extends T[K] ? never : K]: T[K] }} RequiredCtxPropTypes コンテキスト上での必須なプロパティの型
 */

/**
 * @template { string | ComponentType<K> } K
 * @typedef { K extends string
 * 		? (GenStateNode | CtxValueType<string> | GenStateNodeSet)[]
 * 		: Parameters<K>[2] extends undefined ? [] : TransformGenStateNodeToCtxChildType<Parameters<K>[2]>
 * } CtxChildType コンテキスト上での子要素の型
 */

/**
 * @template T
 * @typedef { T  extends unknown[] ? number extends T['length'] ? [] : T : T } RequiredCtxChildType コンテキスト上での必須な子要素の型
 */

/**
 * @template { unknown[] } T
 * @typedef {{
 * 		[K in keyof T]: T[K] extends GenStateTextNode ? CtxValueType<string>
 * 		: T[K] extends GenStateNode ? (GenStateNode | CtxValueType<string>) : T[K];
 * }} TransformGenStateNodeToCtxChildType GenStateNodeからコンテキスト上の子要素の型へ変換
 */

/**
 * @template T
 * @typedef { T extends { propTypes: Record<string, unknown> } ? { [K in keyof T['propTypes']]: CtxValueType<T['propTypes'][K]> } : {} } CtxCompPropTypes コンテキスト上でのコンポーネントのプロパティの型
 */

/**
 * @template T
 * @typedef { T extends { propTypes: Record<string, unknown> } ? { [K in keyof T['propTypes']]: IState<T['propTypes'][K]> } : {} } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @typedef {{
 * 		onMount?: CallerType[];
 * 		onUnmount?: CallerType[];
 * 		onBeforeUpdate?: CallerType[];
 * 		onAfterUpdate?: CallerType[];
 * 		onErrorCaptured?: ((error: unknown, component: StateComponent<unknown>) => boolean | undefined)[];
 * }} LifeCycle ライフサイクル
 */

/**
 * SuspenseContext内部で管理しているローカルコンテキストのインターフェース
 * @interface
 */
class ILocalSuspenseContext {
	/**
	 * 非同期関数をキャプチャしてバックグラウンドで実行する
	 * @param { Context } ctx 非同期関数が発行されたコンテキスト
	 * @param { () => Promise<unknown> } callback キャプチャする非同期関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	/* istanbul ignore next */
	async capture(ctx, callback, cancellable) { throw new Error('not implemented.'); }
}

/**
 * Suspenseに関するコンテキスト
 */
class SuspenseContext {
	/** @type { ILocalSuspenseContext[] } 現在のSuspenseの状態のスタック */
	#stack;

	/**
	 * コンストラクタ
	 * @param { ILocalSuspenseContext | undefined } localSuspenseCtx コンテキストが示すSuspenseに関するローカルコンテキスト
	 */
	constructor(localSuspenseCtx = undefined) {
		this.#stack = localSuspenseCtx ? [localSuspenseCtx] : [];
	}

	/**
	 * ローカルコンテキストの取得
	 */
	get current() { return this.#stack.length === 0 ? undefined : this.#stack[this.#stack.length - 1]; }

	/**
	 * コンテキストの切り替え
	 * @param { () => unknown } callback コンテキストの切り替えが行われるコールバック
	 * @param { ILocalSuspenseContext } localSuspenseCtx callback実行中のみ利用するローカルコンテキスト
	 */
	switch(callback, localSuspenseCtx) {
		this.#stack.push(localSuspenseCtx);
		callback();
		this.#stack.pop();
	}

	/**
	 * 非同期関数をキャプチャしてバックグラウンドで実行する
	 * @param { Context } ctx 非同期関数が発行されたコンテキスト
	 * @param { () => Promise<unknown> } callback キャプチャする非同期関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(ctx, callback, cancellable = true) {
		await new Promise(resolve => {
			const f = async () => {
				const current = this.current;
				if (current) {
					await current.capture(ctx, callback, cancellable);
				}
				else {
					await callback();
				}
				resolve();
			};
			// 標準で遅延実行する
			ctx.state.update2([f]);
		});
	}
}

/**
 * Stateのためのコンテキスト
 */
class StateContext {
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 状態変数とその呼び出し元を記録するスタック */
	#stack = [];
	/** @type { Map<Exclude<CallerType['label'], undefined>, Set<CallerType['caller']> | undefined> } 遅延評価対象の呼び出し元の集合 */
	#lockCaller = new Map();
	/** @type { boolean } onreferenceを発火するかのフラグ */
	#noreference = [false];

	/**
	 * 現在実行中の関数の情報を取得する
	 */
	get current() { return this.#stack.length === 0 ? undefined : this.#stack[this.#stack.length - 1]; }

	/**
	 * このコンテキストで関数を実行する(状態変数の更新操作は基本的に禁止)
	 * @param { CallerType } caller 状態変数の呼び出し元となる関数
	 * @return { { caller: CallerType; states: State<unknown>[] } }
	 */
	call(caller) {
		this.#stack.push({ caller, states: [] });
		caller.caller();
		return this.#stack.pop();
	}

	/**
	 * 状態の更新の通知を行う
	 * @param { Iterable<CallerType> } itr 状態の参照先のハンドラ
	 */
	update(itr) {
		for (const val of [...itr]) {
			const label = val.label;
			if (label) {
				if (this.#lockCaller.has(label)) {
					// lockされているときは蓄積する
					let set = this.#lockCaller.get(label);
					if (!set) {
						set = new Set();
						this.#lockCaller.set(label, set);
					}
					set.add(val.caller);
				}
				else {
					label.update(val.caller);
				}
			}
			// ラベルが未定義の場合は同期的に即時評価
			else {
				val.caller();
			}
		}
	}

	/**
	 * 状態の更新の通知を行う
	 * @param { Iterable<CallerType['caller']> } itr 状態の参照先のハンドラ
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 */
	update2(itr, label) {
		if (label) {
			if (this.#lockCaller.has(label)) {
				// lockされているときは蓄積する
				let set = this.#lockCaller.get(label);
				if (!set) {
					set = new Set();
					this.#lockCaller.set(label, set);
				}
				for (const val of itr) {
					set.add(val);
				}
			}
			else {
				for (const val of [...itr]) {
					label.update(val);
				}
			}
		}
		else {
			// ラベルが未定義の場合は同期的に即時評価
			for (const val of [...itr]) {
				val();
			}
		}
	}

	/**
	 * 指定したラベルについて状態の更新をロックする
	 * @param { Iterable<ICallerLabel> } labelList ラベルのリスト
	 */
	lock(labelList) {
		for (const label of labelList) {
			if (!this.#lockCaller.has(label)) {
				this.#lockCaller.set(label, undefined);
			}
		}
	}

	/**
	 * ラベルについてロックされているか調べる
	 * @param { ICallerLabel } label ラベル
	 * @returns 
	 */
	locked(label) {
		return this.#lockCaller.has(label);
	}

	/**
	 * ロックされた対象のカウントを得る
	 * @param { ICallerLabel } label カウントを得るラベル
	 */
	lockedCount(label) {
		if (this.#lockCaller.has(label)) {
			return this.#lockCaller.get(label)?.size ?? 0;
		}
		return 0;
	}

	/**
	 * 指定したラベルについて状態の更新をロックを解除する
	 * @param { Iterable<ICallerLabel> | undefined } labelList ラベルのリスト(undefinedのときは全てのロックを解除する)
	 */
	unlock(labelList = undefined) {
		if (labelList) {
			/** @type { Map<Exclude<CallerType['label'], undefined>, Set<CallerType['caller']>> } */
			const map = new Map();
			for (const label of labelList) {
				if (this.#lockCaller.has(label)) {
					const set = this.#lockCaller.get(label);
					if (set && set.size > 0) {
						map.set(label, set);
					}
					this.#lockCaller.delete(label);
				}
			}
			return map.size === 0 ? () => {} : () => map.forEach((set, label) => this.update2(set, label));
		}
		else {
			// 全てのロックの解除
			const map = this.#lockCaller;
			this.#lockCaller = new Map();
			return map.size === 0 ? () => {} : () => map.forEach((set, label) => set && set.size > 0 && this.update2(set, label));
		}
	}

	/**
	 * 状態変数のキャプチャの通知
	 * @template T
	 * @param { State<T> } state 通知対象の状態変数
	 */
	notify(state) {
		if (this.#stack.length > 0) {
			this.#stack[this.#stack.length - 1].states.push(state);
		}
	}

	/**
	 * 状態変数の参照の通知
	 * @template T
	 * @param { State<T> } state 通知対象の状態変数
	 */
	onreference(state) {
		if (!this.#noreference[0] && (state.onreference instanceof Function)) {
			// 参照追加に関するイベントの発火
			state.onreference(state);
		}
	}

	/**
	 * 一時的に参照なしで関数を実行する
	 * @template R
	 * @param { () => R } callback 参照なしの状態で実行する関数
	 */
	noreference(callback) {
		this.#noreference[0] = true;
		const ret = callback();
		this.#noreference[0] = false;
		return ret;
	}

	/**
	 * 単方向データの作成
	 * @template T
	 * @param { IState<T> | () => T } src 作成元のデータ
	 * @param { State<T> | (v: T) => unknown } dest 作成対象のデータ
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { caller: CallerType; states: State<unknown>[] } } 呼び出し元情報
	 */
	unidirectional(src, dest, label = undefined) {
		const ctx = src instanceof Function ? this : src.ctx ?? this;
		let circuit = false;
		const callerType = {
			caller:
			// 以下の関数群は何度も実行されることが想定されるため関数内での分岐は最小限にして展開する
			src instanceof Function ?
			dest instanceof Function ?
			() => {
				// srcの変更で必ず発火させつつ
				// destの変更およびsrc = destな操作で発火および循環させない
				if (!circuit) {
					circuit = true;
					dest(src());
					circuit = false;
				}
			} :
			() => {
				if (!circuit) {
					circuit = true;
					dest.value = src();
					circuit = false;
				}
			} :
			dest instanceof Function ?
			() => {
				if (!circuit) {
					circuit = true;
					dest(src.value);
					circuit = false;
				}
			} :
			() => {
				if (!circuit) {
					circuit = true;
					dest.value = src.value;
					circuit = false;
				}
			}
			,label
		};
		if (src instanceof Function) {
			// 関数の場合はsrcで参照されるあらゆる状態変数の変更を監視
			return ctx.call(callerType);
		}
		else {
			callerType.caller();
			if (src instanceof State || src instanceof Computed) {
				// 状態変数の場合はsrc.valueについてのみ変更を監視
				src.add(callerType);
				return { caller: callerType, states: [src instanceof State ? src : src.state] };
			}
			else {
				return { caller: callerType, states: [] };
			}
		}
	}
}

/**
 * コンポーネントのためのコンテキスト
 */
class Context {
	/** @type { typeof window } ウィンドウインターフェース */
	#window;
	/** @type { LifeCycle } コンポーネントに設置されたライフサイクル */
	#lifecycle = {};
	/** @type { StateComponent<unknown> | undefined } コンテキストが属するコンポーネント */
	#component = undefined;
	/** @type { DomUpdateController } DOMの更新のためのコントローラ */
	#domUpdateController;
	/** @type { StateContext } Stateのコンテキスト */
	#stateCtx;
	/** @type { SuspenseContext } Suspenseのコンテキスト */
	#suspenseCtx;
	/** @type { GenStateNode | undefined } 現在構築中のStateNodeに関する生成元 */
	genStateNode = undefined;

	/** @type { DomUpdateLabel | undefined } DOM更新の際に用いるラベル */
	#domUpdateLabel = undefined;
	/** @type { SideEffectLabel<unknown> | CommonLabel | undefined } 副作用が生じる可能性がある更新の際に用いるラベル */
	#sideEffectLabel = undefined;

	/** @type { [boolean] } 子へ関数要素を伝播したかを示すフラグ */
	#functionDeliveryFlag = [false];

	/** @type { 'wait' | 'nowait' } コンポーネントの構築方式 */
	waitFlag = 'nowait';

	/**
	 * コンストラクタ
	 * @param { typeof window } window ウィンドウインターフェース
	 * @param { DomUpdateController | undefined } domUpdateController DOMの更新のためのコントローラ
	 * @param { StateContext | undefined } stateCtx Suspenseのコンテキスト
	 * @param { SuspenseContext | undefined } suspenseCtx Suspenseのコンテキスト
	 */
	constructor(window, domUpdateController = undefined, stateCtx = undefined, suspenseCtx = undefined) {
		this.#window = window;
		this.#domUpdateController = domUpdateController ?? new DomUpdateController();
		this.#stateCtx = stateCtx ?? new StateContext();
		this.#suspenseCtx = suspenseCtx ?? new SuspenseContext();
	}

	/**
	 * コンポーネントが属するコンテキストを生成する
	 * @param { (ctx: Context) => StateComponent<unknown> } gen コンポーネントを示すノードを生成する関数
	 * @returns { Context }
	 */
	generateContextForComponent(gen) {
		const ctx = new Context(this.#window, this.#domUpdateController, this.#stateCtx, this.#suspenseCtx);
		ctx.#component = gen(ctx);
		ctx.waitFlag = this.waitFlag;
		return ctx;
	}

	/**
	 * Suspenseが属するコンテキストを生成する
	 * @param { SuspenseContext } suspenseCtx 新たに生成するコンテキストがもつSuspenseのコンテキスト
	 * @returns { Context }
	 */
	generateContextForSuspense(suspenseCtx) {
		const ctx = new Context(this.#window, this.#domUpdateController, this.#stateCtx, suspenseCtx);
		ctx.#lifecycle = this.#lifecycle;
		ctx.#component = this.#component;
		ctx.#domUpdateLabel = this.domUpdateLabel;
		ctx.#sideEffectLabel = this.sideEffectLabel;
		ctx.#functionDeliveryFlag = this.#functionDeliveryFlag;
		ctx.waitFlag = this.waitFlag;
		return ctx;
	}

	/**
	 * ウィンドウインターフェースの取得
	 * @returns { typeof window }
	 */
	get window() { return this.#window; }

	/**
	 * コンテキストを示すコンポーネントの取得
	 */
	get component() { return this.#component; }

	/**
	 * StateContextの取得
	 */
	get state() { return this.#stateCtx; }

	/**
	 * SuspenseContextの取得
	 */
	get suspense() { return this.#suspenseCtx; }

	/**
	 * DOM更新の際に用いるラベル
	 */
	get domUpdateLabel() { return this.#domUpdateLabel || (this.#domUpdateLabel = new DomUpdateLabel(this)); }

	/**
	 * 副作用が生じる可能性がある更新の際に用いるラベル
	 */
	get sideEffectLabel() { return this.#sideEffectLabel || (this.#sideEffectLabel = this.#component ? new SideEffectLabel(this.#component) : new CommonLabel()); }

	/**
	 * 子要素へ関数を伝播したことを通知する
	 */
	notifyFunctionDelivery() {
		this.#functionDeliveryFlag[0] = true;
	}

	/**
	 * 子要素への関数の伝播が存在するかを取得する
	 */
	get hasFunctionDelivery() { return this.#functionDeliveryFlag[0]; }

	/**
	 * このコンテキストで関数を実行する(状態変数の更新操作は基本的に禁止)
	 * @param { CallerType['caller'] | CallerType } caller 状態変数の呼び出し元となる関数
	 * @return { { caller: CallerType; states: State<unknown>[] } }
	 */
	call(caller) {
		return this.#stateCtx.call(caller instanceof Function ? { caller, label: this.sideEffectLabel } : caller);
	}

	/**
	 * 非同期関数をキャプチャしてバックグラウンドで実行する
	 * @param { () => Promise<unknown> } callback キャプチャする非同期関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(callback, cancellable = true) {
		await this.#suspenseCtx.capture(this, callback, cancellable);
	}

	/**
	 * DOMノードの状態の更新の蓄積を行う
	 * @param { ICallerLabel } callerLabel 更新情報
	 */
	update(callerLabel) {
		this.#domUpdateController.update(callerLabel);
	}

	/**
	 * 自コンテキストで動作するコンポーネントを示す関数を実行するの実装部
	 * @template { ComponentType<K> } K
	 * @param { ReturnType<K> } compResult コンポーネントを示す関数の実行結果
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 * @returns { GenStateComponent }
	 */
	#buildComponentImpl(compResult, observableStates, callerList) {
		if (compResult instanceof GenStateNode) {
			return compResult;
		}
		else {
			// 観測の評価
			if (observableStates) {
				const exposeStates = compResult.exposeStates ?? {};
				for (const key in observableStates) {
					const state = observableStates[key];
					const exposeState = exposeStates[key];
					// 状態の観測の実施
					const caller = state.observe(exposeState);
					if (caller && caller.states.length > 0) callerList.push(caller);
				}
			}

			return compResult.node;
		}
	}

	/**
	 * 自コンテキストで動作するコンポーネントを示す関数を実行する
	 * @template { ComponentType<K> } K
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { GenStateNode[] } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 * @returns {{ getStateNode: GenStateNode; exposeStates: ComponentExposeStates<K> }}
	 */
	buildComponent(component, props, children, observableStates, callerList) {
		return this.#buildComponentImpl(component(this, props, children), observableStates, callerList);
	}

	/**
	 * 自コンテキストで動作する非同期コンポーネントを示す関数を実行する
	 * @template { ComponentType<K> } K
	 * @param { AsyncComponentType<K> } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { GenStateNode[] } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 * @returns { Promise<{ getStateNode: GenStateNode; exposeStates: ComponentExposeStates<K> }> }
	 */
	async buildAsyncComponent(component, props, children, observableStates, callerList) {
		return this.#buildComponentImpl(await component(this, props, children), observableStates, callerList);
	}

	/**
	 * ライフサイクルの取得(異なるコンテキスト間でインスタンスを一致させるためにsetterは提供しない)
	 */
	get lifecycle() { return this.#lifecycle; }

	/**
	 * ライフサイクルの設定
	 * @param { Exclude<LifeCycle[key], undefined>[number] } callback ライフサイクルで呼びだすコールバック
	 * @param { keyof LifeCycle } key 設定対象のライフサイクルを示すキー
	 */
	#onLifeCycle(callback, key) {
		if (!this.#component) {
			throw new Error('This function should not be called except to initialize a component.');
		}
		this.#lifecycle[key] = this.#lifecycle[key] || [];
		this.#lifecycle[key].push(callback);
	}

	/**
	 * onMount時のライフサイクルの設定
	 * @param { () => unknown } callback onMount時に呼びだすコールバック
	 * @param { CallerType['label'] } label ライフサイクルフックの振る舞いを決めるラベル
	 */
	onMount(callback, label = this.sideEffectLabel) {
		this.#onLifeCycle({ caller: callback, label }, 'onMount');
	}

	/**
	 * onUnmount時のライフサイクルの設定
	 * @param { () => unknown } callback onUnmount時に呼びだすコールバック
	 * @param { CallerType['label'] } label ライフサイクルフックの振る舞いを決めるラベル
	 */
	onUnmount(callback, label = this.sideEffectLabel) {
		this.#onLifeCycle({ caller: callback, label }, 'onUnmount');
	}

	/**
	 * onBeforeUpdate時のライフサイクルの設定
	 * @param { () => unknown } callback onBeforeUpdate時に呼びだすコールバック
	 * @param { CallerType['label'] } label ライフサイクルフックの振る舞いを決めるラベル
	 */
	onBeforeUpdate(callback, label = this.sideEffectLabel) {
		this.#onLifeCycle({ caller: callback, label }, 'onBeforeUpdate');
	}

	/**
	 * onAfterUpdate時のライフサイクルの設定
	 * @param { () => unknown } callback onAfterUpdate時に呼びだすコールバック
	 * @param { CallerType['label'] } label ライフサイクルフックの振る舞いを決めるラベル
	 */
	onAfterUpdate(callback, label = this.sideEffectLabel) {
		this.#onLifeCycle({ caller: callback, label }, 'onAfterUpdate');
	}

	/**
	 * onErrorCaptured時のライフサイクルの設定
	 * @param { (error: unknown, component: StateComponent<unknown>) => boolean | undefined } callback onErrorCaptured時に呼びだすコールバック
	 */
	onErrorCaptured(callback) {
		this.#onLifeCycle(callback, 'onErrorCaptured');
	}
}

/**
 * パラメータの設定
 * @template Val
 * @param { CtxValueType<Val> } val パラメータの値
 * @param { (val: Val) => unknown } setter パラメータの設定のルール
 * @param { CallerType['label'] } label setterに付加するラベル
 */
function setParam(val, setter, label = undefined) {
	if (val instanceof State || val instanceof Computed) {
		// 状態変数の場合は変更を監視
		const callerType = { caller: () => setter(val.value), label };
		callerType.caller();
		val.add(callerType);
		return { caller: callerType, states: [val instanceof State ? val : val.state] };
	}
	else if (val instanceof IState) {
		setter(val.value);
	}
	else {
		// 状態変数でない場合はそのまま設定
		setter(val);
	}
}

/**
 * 状態変数の宣言
 * @template T
 * @param { Context | StateContext } ctx 状態変数が属するコンテキスト
 * @param { T } value 状態変数の初期値
 * @returns { State<T> }
 */
function useState(ctx, value) {
	return new State(ctx instanceof Context ? ctx.state : ctx, value);
}

/**
 * 算出プロパティの宣言
 * @template T
 * @param { Context | StateContext } ctx 状態変数が属するコンテキスト
 * @param { () => T } f 算出プロパティを計算する関数
 * @returns { Computed<T> }
 */
function useComputed(ctx, f) {
	return new Computed(ctx instanceof Context ? ctx.state : ctx, f);
}

/**
 * @template T
 * @overload
 * @param { Context | StateContext } ctx ウォッチを行うコンテキスト
 * @param { IState<T> } state 監視を行う状態変数
 * @param { (prev: T, next: T) => unknown } f ウォッチャー
 * @returns { CallerType }
 */
/**
 * @template T
 * @overload
 * @param { Context | StateContext } ctx ウォッチを行うコンテキスト
 * @param { IState<unknown>[] } state 監視を行う状態変数のリスト
 * @param { () => unknown } f ウォッチャー
 * @returns { CallerType }
 */
/**
 * ウォッチャーの宣言
 * @template T
 * @param { Context | StateContext } ctx ウォッチを行うコンテキスト
 * @param { IState<unknown>[] | IState<T> } state 監視を行う状態変数
 * @param { (() => unknown) | ((prev: T, next: T) => unknown) } f ウォッチャー
 * @returns { CallerType | undefined }
 */
function watch(ctx, state, f) {
	const label = ctx instanceof Context ?  ctx.sideEffectLabel : undefined;

	if (state instanceof IState) {
		let prevState =  state.value;
		let nextState = state.value;

		/** @type { CallerType } */
		const caller = {
			caller: () => {
				prevState = nextState;
				nextState = state.value;
				return f(prevState, nextState);
			}, label
		};
		(state instanceof State || state instanceof Computed) && state.add(caller);
		return caller;
	}
	else {
		/** @type { CallerType } */
		const caller = { caller: f, label };
		state.forEach(s => (s instanceof State || s instanceof Computed) && s.add(caller));
		return caller;
	}
}

/**
 * ノードリストを正規化する
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @param { CtxChildType<K> } nodeList 対象のノード
 * @returns { K extends string ? (GenStateNode | GenStateNodeSet)[] : CompChildrenType<K> }
 */
function normalizeCtxChild(nodeList) {
	return Array.isArray(nodeList) ? nodeList.map(e => {
		// 子にテキストの状態が渡された場合は変更を監視する
		if (e instanceof IState) {
			return new GenStateTextNode(e);
		}
		else if (typeof e === 'string') {
			return new GenStateTextNode(e);
		}
		else {
			return e;
		}
	}) : nodeList;
};

/**
 * プロパティを正規化する(stateComponentを設定することで副作用を捕捉するようになる)
 * @template { ComponentType<K> | AsyncComponentType<K> } K
 * @param { K } component コンポーネントを示す関数
 * @param { CtxCompPropTypes<K> } props 変換対象のプロパティ
 * @param { StateComponent<K> | undefined } stateComponent 正規化を行う対象のコンポーネント
 */
function normalizeCtxProps(component, props, stateComponent = undefined) {
	/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
	const compProps = {};
	// IStateによる連想配列へ変換
	if (stateComponent) {
		for (const key in component.propTypes ?? {}) {
			const val = props[key];
			if (val instanceof IState) {
				compProps[key] = val;
			}
			else {
				// 値が与えられなかった場合はデフォルト値から持ってきてIStateとなるように伝播
				const val2 = val === undefined ? component.propTypes[key] : val;
				if (val2 instanceof Function) {
					// 関数を設定する場合はエラーハンドリングを行うようにする
					compProps[key] = new NotState(createWrapperFunction(val2, stateComponent));
					// コンポーネントへ副作用が生じる可能性のある処理が伝播されることを通知する
					stateComponent.ctx.notifyFunctionDelivery();
				}
				else {
					compProps[key] = new NotState(val2);
				}
			}
		}
	}
	else {
		for (const key in component.propTypes ?? {}) {
			const val = props[key];
			if (val instanceof IState) {
				compProps[key] = val;
			}
			else {
				// 値が与えられなかった場合はデフォルト値から持ってきてIStateとなるように伝播
				compProps[key] = new NotState(val === undefined ? component.propTypes[key] : val);
			}
		}
	}
	return compProps;
}

/**
 * 擬似コンポーネントであることの判定
 * @template { ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @param { ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } f 
 * @returns { f is PseudoComponentType<K> }
 */
function isPseudoComponent(f) {
	return f.early === true;
}

/**
 * 非同期コンポーネントであることの判定
 * @template { ComponentType<K> | AsyncComponentType<K> } K
 * @param { ComponentType<K> | AsyncComponentType<K> } f 
 * @returns { f is AsyncComponentType<K> }
 */
function isAsyncComponent(f) {
	return f.constructor?.name === 'AsyncFunction';
}

/**
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @overload
 * @param { K } tag HTMLタグ
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? CtxPropTypes<K> | undefined : CtxPropTypes<K> } props プロパティ
 * @param { RequiredCtxChildType<CtxChildType<K>> extends [] ? CtxChildType<K> | undefined : CtxChildType<K> } children 子要素
 * @returns { K extends string ? GenStateDomNode<K> : (K extends PseudoComponentType<K> ? ReturnType<K> : GenStateComponent<K>) }
 */
/**
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @overload
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? K : never } tag HTMLタグ
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? CtxChildType<K> : never } props 子要素
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? undefined : never } children 略
 * @returns { K extends string ? GenStateDomNode<K> : (K extends PseudoComponentType<K> ? ReturnType<K> : GenStateComponent<K>) }
 */
/**
 * DOMノード/コンポーネントの生成
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @param { K } tag HTMLタグ
 * @param { CtxPropTypes<K> | CtxChildType<K> | undefined } props プロパティ
 * @param { CtxChildType<K> | undefined } children 子要素
 * @returns { K extends string ? GenStateDomNode<K> : (K extends PseudoComponentType<K> ? ReturnType<K> : GenStateComponent<K>) }
 */
function $(tag, props = undefined, children = undefined) {
	const isProps = props?.constructor?.name === 'Object';
	const _props = isProps ? props : {};
	const _children = normalizeCtxChild((!isProps ? props : children) ?? []);
	// HTMLタグによるDOMノードの生成(Web Componentsも含む)
	if (typeof tag === 'string') {
		return new GenStateDomNode(tag, _props, _children);
	}
	// コンポーネントによるDOMノード生成
	else {
		if (isPseudoComponent(tag)) {
			return tag(_props, _children);
		}
		else if (isAsyncComponent(tag)) {
			// 非同期コンポーネントの生成
			return new GenStateAsyncComponent(tag, _props, _children);
		}
		else {
			// 同期コンポーネントの生成
			return new GenStateComponent(tag, _props, _children);
		}
	}
}

/**
 * テキスト要素の構成
 * @param { TemplateStringsArray } strs タグ付きテンプレートの文字列部
 * @param  { ...(CtxValueType<string | number>) } values タグ付きテンプレートの変数
 * @return { string | Computed<string> }
 */
function t(strs, ...values) {
	// テンプレートに状態が含まれるかの判定
	let useStateFlag = false;
	let ctx = undefined;
	for (const value of values) {
		if (value instanceof State || value instanceof Computed) {
			useStateFlag = true;
			ctx = value.ctx;
			break;
		}
	}
	// 結果の文字列を計算する関数
	const f = () => {
		let result = '';
		values.forEach((value, idx) => {
			result += strs[idx];
			if (value instanceof IState) {
				result += `${value.value}`;
			}
			else {
				result += `${value}`;
			}
		});
		return result + strs[strs.length - 1];
	};
	return useStateFlag ? new Computed(ctx, f) : f();
}

/**
 * HTMLElementを示すStateNodeの生成
 * @param { HTMLElement } element StateNodeの生成対象
 */
function html(element) {
	return new GenStateHTMLElement(element);
}

/**
 * エラーハンドリングを行うようにラップした関数を生成する
 * @template { Function } T
 * @template { ComponentType<K> } K
 * @param { T } f ラップ対象の関数
 * @param { StateComponent<K> } component エラーハンドリング対象のコンポーネント
 * @return { T }
 */
function createWrapperFunction(f, component) {
	/**
	 * @param { Parameters<T> } args
	 */
	return (...args) => {
		try {
			const ret = f(...args);
			if (ret instanceof Promise) {
				return ret.catch(reason => component.onErrorCaptured(reason, component));
			}
			return ret;
		}
		catch (e) {
			component.onErrorCaptured(e, component);
		}
	}
}

/**
 * 文字列をStateNodeSetに変換する
 * @param { Context } ctx 
 * @param { string } text 
 */
function textToStateNodeSet(ctx, text) {
	const div = ctx.window.document.createElement('div');
	div.innerHTML = text;
	return new GenStateNodeSet([...div.childNodes].filter(
		child => child.nodeType === ctx.window.Node.ELEMENT_NODE || child.nodeType === ctx.window.Node.TEXT_NODE
	).map(child => {
		switch (child.nodeType) {
			case ctx.window.Node.ELEMENT_NODE:
				return html(child);
			case ctx.window.Node.TEXT_NODE:
				return new GenStateTextNode(child.data);
		}
	}));
}

export {
	CommonLabel,
	IState,
	NotState,
	State,
	Computed,
	StateNode,
	StatePlaceholderNode,
	StateNodeSet,
	StateComponent,
	StateAsyncComponent,
	GenStateNode,
	GenStateNodeSet,
	GenStateTextNode,
	GenStatePlaceholderNode,
	GenStateComponent,
	ILocalSuspenseContext,
	SuspenseContext,
	StateContext,
	Context,
	useState,
	useComputed,
	watch,
	normalizeCtxChild,
	normalizeCtxProps,
	$,
	t,
	html,
	textToStateNodeSet
};
