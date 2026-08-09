import { createElement, Fragment, type ReactNode } from 'react';
import {
  parseLatexMath,
  parseMessageMarkdown,
  type MathNode,
  type MessageBlock,
  type MessageInline,
} from '../../utils/messageMarkup';
import styles from './FormattedMessage.module.css';

function renderMath(node: MathNode, key: string): ReactNode {
  if (node.kind === 'text') return node.value;
  const children = node.children.map((child, index) => renderMath(child, `${key}-${index}`));
  return createElement(
    node.name,
    { ...node.attrs, key, className: node.name === 'math' ? styles.math : undefined },
    children,
  );
}

function renderInline(nodes: MessageInline[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (node.type === 'text' || node.type === 'code') {
      return node.type === 'code' ? <code key={key}>{node.value}</code> : <Fragment key={key}>{node.value}</Fragment>;
    }
    if (node.type === 'break') return <br key={key} />;
    if (node.type === 'math') return renderMath(parseLatexMath(node.value), key);
    if (node.type === 'link') {
      return <a key={key} href={node.href} target="_blank" rel="noreferrer">{renderInline(node.label, key)}</a>;
    }
    const Tag = node.type === 'strong' ? 'strong' : node.type === 'del' ? 'del' : 'em';
    return <Tag key={key}>{renderInline(node.children, key)}</Tag>;
  });
}

function renderBlock(block: MessageBlock, index: number): ReactNode {
  const key = `block-${index}`;
  if (block.type === 'code') {
    return <pre key={key} className={styles.code}><code data-language={block.language || undefined}>{block.value}</code></pre>;
  }
  if (block.type === 'math') return <div key={key} className={styles.displayMath}>{renderMath(parseLatexMath(block.value, true), key)}</div>;
  if (block.type === 'rule') return <hr key={key} />;
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return <Tag key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</Tag>;
  }
  if (block.type === 'heading') {
    const Tag = `h${Math.min(6, Math.max(1, block.level ?? 2))}` as keyof JSX.IntrinsicElements;
    return <Tag key={key}>{renderInline(block.children, key)}</Tag>;
  }
  if (block.type === 'blockquote') return <blockquote key={key}>{renderInline(block.children, key)}</blockquote>;
  return <p key={key}>{renderInline(block.children, key)}</p>;
}

export interface FormattedMessageProps {
  content: string;
  className?: string;
}

export function FormattedMessage({ content, className }: FormattedMessageProps) {
  const blocks = parseMessageMarkdown(content);
  return <div className={[styles.root, className].filter(Boolean).join(' ')}>{blocks.map(renderBlock)}</div>;
}
