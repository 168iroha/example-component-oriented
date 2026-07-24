/** @jest-environment jsdom */
import { Context, StateNodeSet, GenStateNodeSet, GenStateTextNode, useState, $, t, textToStateNodeSet } from "../../src/core.js";
import { describe, it, expect } from '@jest/globals';

describe('StateNodeSet', () => {
	it('GenStateNodeSetから複数の兄弟ノードを構築できる', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		const set = new GenStateNodeSet([
			$('p', ['1']),
			$('p', ['2']),
			new GenStateTextNode('text')
		]);
		$('div', [set]).mount(document.getElementById('app'), ctx);
		expect(document.getElementById('app').innerHTML).toBe('<p>1</p><p>2</p>text');
	});

	it('ネストしたGenStateNodeSetも展開される', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		const inner = new GenStateNodeSet([$('span', ['a']), $('span', ['b'])]);
		const outer = new GenStateNodeSet([$('p', ['0']), inner]);
		$('div', [outer]).mount(document.getElementById('app'), ctx);
		expect(document.getElementById('app').innerHTML).toBe('<p>0</p><span>a</span><span>b</span>');
	});

	it('getStateNodeSetとfirst/last/nodeSetによりノードを参照できる', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		/** @type { StateNodeSet | undefined } */
		let stateSet = undefined;
		const set = new GenStateNodeSet([$('p', ['1']), $('p', ['2'])]).getStateNodeSet(s => stateSet = s);
		$('div', [set]).mount(document.getElementById('app'), ctx);

		expect(stateSet).toBeInstanceOf(StateNodeSet);
		expect(stateSet.first.element.textContent).toBe('1');
		expect(stateSet.last.element.textContent).toBe('2');
		expect([...stateSet.nodeSet()].length).toBe(2);
	});

	it('ref({ set })によりStateNodeSetを参照できる', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		const setState = useState(ctx, undefined);
		const set = new GenStateNodeSet([$('p', ['x'])]).ref({ set: setState });
		$('div', [set]).mount(document.getElementById('app'), ctx);
		expect(setState.org).toBeInstanceOf(StateNodeSet);
	});

	it('detachによりノードの関連を維持したままDOMから取り外せる', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		/** @type { StateNodeSet | undefined } */
		let stateSet = undefined;
		const set = new GenStateNodeSet([$('p', ['1']), $('p', ['2'])]).getStateNodeSet(s => stateSet = s);
		$('div', [set]).mount(document.getElementById('app'), ctx);
		expect(document.querySelectorAll('#app p').length).toBe(2);

		stateSet.detach();
		expect(document.querySelectorAll('#app p').length).toBe(0);
	});

	it('insertBeforeにより指定位置へノードを挿入できる', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		/** @type { StateNodeSet | undefined } */
		let stateSet = undefined;
		const set = new GenStateNodeSet([$('p', ['1']), $('p', ['2'])]).getStateNodeSet(s => stateSet = s);
		// マウントせずに構築だけを行い、手動でDOMへ挿入する
		const { element } = $('div', [set]).build(ctx);
		document.getElementById('app').appendChild(element);
		stateSet.detach();
		expect(element.childNodes.length).toBe(0);

		stateSet.insertBefore(undefined, element);
		expect(element.innerHTML).toBe('<p>1</p><p>2</p>');
	});

	it('textToStateNodeSetによりHTML文字列からノードの集合を構築できる', () => {
		document.body.innerHTML = '<div id="app"></div>';
		const ctx = new Context(window);
		const set = textToStateNodeSet(ctx, '<span>a</span>text<b>c</b>');
		$('div', [set]).mount(document.getElementById('app'), ctx);
		expect(document.getElementById('app').innerHTML).toBe('<span>a</span>text<b>c</b>');
	});
});
