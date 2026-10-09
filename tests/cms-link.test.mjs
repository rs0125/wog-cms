import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import { loader } from './helpers/agent-cms.mjs';

test('links prefetch only on intent and preserve caller event handlers and options', () => {
  let active = false;
  const load = loader({ react: { ...React, useState: () => [active, value => { active = value; }] } });
  const Link = load('components/CmsLink.tsx').default;
  for (const event of ['onMouseEnter', 'onFocus', 'onTouchStart']) {
    active = false;
    let handled = 0;
    const props = { href: '/blogs', children: 'Blogs', [event]: () => handled++ };
    const link = Link(props);
    assert.equal(link.props.prefetch, false);
    link.props[event]({ defaultPrevented: false });
    assert.equal(handled, 1);
    assert.equal(Link(props).props.prefetch, null);
    assert.equal(Link({ ...props, prefetch: false }).props.prefetch, false);
    assert.equal(Link({ ...props, prefetch: true }).props.prefetch, true);
  }
  active = false;
  Link({ href: '/blogs', onFocus: e => { e.defaultPrevented = true; } }).props.onFocus({ defaultPrevented: false });
  assert.equal(active, false);
  const onNavigate = () => {}, onClick = () => {};
  const link = Link({ href: '/blogs', onNavigate, onClick, target: '_blank', replace: true });
  assert.equal(link.props.onNavigate, onNavigate);
  assert.equal(link.props.onClick, onClick);
  assert.equal(link.props.target, '_blank');
  assert.equal(link.props.replace, true);
});
