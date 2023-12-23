import { declare } from '@babel/helper-plugin-utils';
import * as t from '@babel/types';

/**
 * @typedef { import("@babel/types").JSXElement } JSXElement
 */

/**
 * @typedef { import("@babel/types").JSXOpeningElement } JSXOpeningElement
 */

/**
 * @typedef { import("@babel/types").Expression } Expression
 */

/**
 * @typedef { import("@babel/types").ObjectProperty } ObjectProperty
 */

/**
 * @typedef { import("@babel/types").SpreadElement } SpreadElement
 */

/**
 * タグ名を示すノードの取得
 * @param { JSXOpeningElement['name'] } name タグ名の部分を示すノード
 * @returns { Expression }
 */
function getTagName(name) {
	if (name.type === 'JSXNamespacedName') {
		// 名前空間(namespace:tagName)はサポートしない
		const namespace = name.namespace.name;
		const error = new Error(`The namespace ${namespace} is not supported.`);
		error.loc = path.node.loc;
		throw error;
	}
	if (name.type === 'JSXIdentifier') {
		// 先頭が大文字なら関数形式のコンポーネント、小文字ならDOMノードとする
		const tagName = name.name;
		return tagName.at(0) === tagName.at(0).toUpperCase() ? t.identifier(tagName) : t.stringLiteral(tagName);
	}

	// JSXMemberExpressionからMemberExpressionに変換する
	let identList = [t.identifier(name.property.name)];
	while (name.type === 'JSXMemberExpression') {
		name = name.object;
		identList.push(t.identifier(name.type === 'JSXIdentifier' ? name.name : name.property.name));
	}
	let node = identList[identList.length - 1];
	for (let i = identList.length - 1; i > 0; --i) {
		node = t.memberExpression(
			node,
			identList[i - 1]
		);
	}

	return node;
}

/**
 * 子要素の変換
 * @param { JSXElement['children'] } children 子要素
 * @returns { (Expression | JSXElement | SpreadElement)[] }
 */
function transformChildren(children) {
	/** @type { (Expression | JSXElement | SpreadElement)[] } */
	const result = [];
	/** @type { JSXElement['children'][number] | null } */
	let prev = null;
	for (let i = 0; i < children.length; ++i) {
		const child = children[i];
		switch (child.type) {
			case 'JSXText':
				// 必要に応じてトリミングをする
				const rtrimFlag = child.value.includes('\n') || !(i + 1 < children.length && (children[i + 1].type === 'JSXExpressionContainer' || children[i + 1].type === 'JSXSpreadChild'));
				const ltrimFlag = prev?.type !== 'JSXExpressionContainer' || prev?.type !== 'JSXSpreadChild';
				const text = ltrimFlag && rtrimFlag ? child.value.trim()
							: ltrimFlag ? child.value.trimStart()
							: rtrimFlag ? child.value.trimEnd()
							: child.value;
				if (text.length !== 0) {
					result.push(t.stringLiteral(text));
				}
				break;
			case 'JSXExpressionContainer':
				if (child.expression.type !== 'JSXEmptyExpression') {
					result.push(child.expression);
				}
				break;
			case 'JSXSpreadChild':
				result.push(t.spreadElement(child.expression));
				break;
			case 'JSXFragment':
				// <>～</>は無視する
				result.push(...transformChildren(child.children));
				break;
			case 'JSXElement':
				result.push(child);
				break;
		}
		prev = child;
	}
	return result;
}

/**
 * 属性要素の変換
 * @param { JSXElement['openingElement']['attributes'] } attributes 属性要素
 * @returns { [(ObjectProperty | SpreadElement)[], Record<string, ObjectProperty[]>] }
 */
function transformAttributes(attributes) {
	/** @type { (ObjectProperty | SpreadElement)[] } 属性のリスト */
	const attrList = [];
	/** @type { Record<string, ObjectProperty[]> } 名前空間付きの属性のリスト */
	const namedAttrList = {};

	for (const attribute of attributes) {
		switch (attribute.type) {
			case 'JSXAttribute':
				const namespace = attribute.name.type === 'JSXNamespacedName' ? attribute.name.namespace.name : undefined;
				const attrName = attribute.name.type === 'JSXNamespacedName' ? attribute.name.name.name : attribute.name.name;

				// オブジェクトのプロパティの構築
				const property = t.objectProperty(
					t.stringLiteral(attrName),
					attribute.value.type === 'JSXExpressionContainer' ? attribute.value.expression : attribute.value
				);
				if (namespace) {
					namedAttrList[namespace] = namedAttrList[namespace] || [];
					namedAttrList[namespace].push(property);
				}
				else {
					attrList.push(property);
				}
				break;
			case 'JSXSpreadAttribute':
				// 名前空間の取得は不可のため全てプロパティとして評価
				attrList.push(t.spreadElement(attribute.argument));
				break;
		}
	}
	return [attrList, namedAttrList];
}

/**
 * ノードの変換
 * @param { string } namespace 名前空間
 * @param { Expression } tagName タグ名
 * @param { [(ObjectProperty | SpreadElement)[], Record<string, ObjectProperty[]>] } attributes 属性要素
 * @param { (Expression | JSXElement | SpreadElement)[] } children 子要素
 * @returns { Expression }
 */
function transformNode(tagName, attributes, children) {
	const [attrList, namedAttrList] = attributes;
	// 名前空間付き属性の呼びだすメソッド名との対応付け
	const nameToMethodNameMap = {
		'obs': 'observe',
		'ref': 'ref'
	};

	// ノード構築のための引数の構築
	const args = [tagName];
	if (attrList.length !== 0) {
		args.push(t.objectExpression(attrList));
	}
	if (children.length > 0) {
		let childrenNode = t.arrayExpression(children);
		// func:argsが存在すれば関数形式で子を与える
		if ('func' in namedAttrList) {
			const property = namedAttrList['func'].find(p => {
				return p.key.type === 'StringLiteral' && p.key.value === 'args';
			});
			if (property) {
				const args = [];
				// 識別子の要素のみを引数とする
				if (property.value.type === 'ArrayExpression') {
					for (const element of property.value.elements) {
						if (element?.type === 'Identifier') {
							args.push(element);
						}
					}
				}
				childrenNode = t.arrowFunctionExpression(args, childrenNode);
			}
		}
		args.push(childrenNode);
	}
	// ノードを示すASTの構築
	let node = t.callExpression(
		t.identifier('$'),
		args
	);

	// 名前空間付き属性の評価
	for (const key in namedAttrList) {
		if (key in nameToMethodNameMap) {
			node = t.callExpression(
				t.memberExpression(
					node,
					t.identifier(nameToMethodNameMap[key])
				),
				[
					t.objectExpression(namedAttrList[key]),
				]
			)
		}
	}

	return node;
}

export default declare((api, options) => {
	return {
		visitor: {
			JSXElement(path) {
				const openingElement = path.node.openingElement;

				// JavaScriptのASTを構築してJSXと置き換える
				path.replaceWith(
					// $()部の構築
					transformNode(
						// タグ名の取得
						getTagName(openingElement.name),
						// 属性要素の構築
						transformAttributes(openingElement.attributes),
						// 子要素の構築
						transformChildren(path.node.children)
					)
				);
			},
			JSXFragment(path) {
				// JSXFragmentはサポートしない
				const error = new Error('It is prohibited to place a JSXFragment on the root element.');
				error.loc = path.node.loc;
				throw error;
			}
		}
	};
});