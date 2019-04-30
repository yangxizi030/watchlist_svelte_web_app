var app = (function () {
	'use strict';

	function noop() {}

	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	function run_all(fns) {
		fns.forEach(run);
	}

	function is_function(thing) {
		return typeof thing === 'function';
	}

	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function validate_store(store, name) {
		if (!store || typeof store.subscribe !== 'function') {
			throw new Error(`'${name}' is not a store with a 'subscribe' method`);
		}
	}

	function subscribe(component, store, callback) {
		component.$$.on_destroy.push(store.subscribe(callback));
	}

	const tasks = new Set();
	let running = false;

	function run_tasks() {
		tasks.forEach(task => {
			if (!task[0](window.performance.now())) {
				tasks.delete(task);
				task[1]();
			}
		});

		running = tasks.size > 0;
		if (running) requestAnimationFrame(run_tasks);
	}

	function loop(fn) {
		let task;

		if (!running) {
			running = true;
			requestAnimationFrame(run_tasks);
		}

		return {
			promise: new Promise(fulfil => {
				tasks.add(task = [fn, fulfil]);
			}),
			abort() {
				tasks.delete(task);
			}
		};
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor);
	}

	function detach(node) {
		node.parentNode.removeChild(node);
	}

	function destroy_each(iterations, detaching) {
		for (let i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detaching);
		}
	}

	function element(name) {
		return document.createElement(name);
	}

	function text(data) {
		return document.createTextNode(data);
	}

	function space() {
		return text(' ');
	}

	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else node.setAttribute(attribute, value);
	}

	function children(element) {
		return Array.from(element.childNodes);
	}

	function set_data(text, data) {
		data = '' + data;
		if (text.data !== data) text.data = data;
	}

	function set_style(node, key, value) {
		node.style.setProperty(key, value);
	}

	let current_component;

	function set_current_component(component) {
		current_component = component;
	}

	function get_current_component() {
		if (!current_component) throw new Error(`Function called outside component initialization`);
		return current_component;
	}

	function onMount(fn) {
		get_current_component().$$.on_mount.push(fn);
	}

	const dirty_components = [];

	let update_promise;
	const binding_callbacks = [];
	const render_callbacks = [];
	const flush_callbacks = [];

	function schedule_update() {
		if (!update_promise) {
			update_promise = Promise.resolve();
			update_promise.then(flush);
		}
	}

	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	function flush() {
		const seen_callbacks = new Set();

		do {
			// first, call beforeUpdate functions
			// and update components
			while (dirty_components.length) {
				const component = dirty_components.shift();
				set_current_component(component);
				update(component.$$);
			}

			while (binding_callbacks.length) binding_callbacks.shift()();

			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			while (render_callbacks.length) {
				const callback = render_callbacks.pop();
				if (!seen_callbacks.has(callback)) {
					callback();

					// ...so guard against infinite loops
					seen_callbacks.add(callback);
				}
			}
		} while (dirty_components.length);

		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}

		update_promise = null;
	}

	function update($$) {
		if ($$.fragment) {
			$$.update($$.dirty);
			run_all($$.before_render);
			$$.fragment.p($$.dirty, $$.ctx);
			$$.dirty = null;

			$$.after_render.forEach(add_render_callback);
		}
	}

	function mount_component(component, target, anchor) {
		const { fragment, on_mount, on_destroy, after_render } = component.$$;

		fragment.m(target, anchor);

		// onMount happens after the initial afterUpdate. Because
		// afterUpdate callbacks happen in reverse order (inner first)
		// we schedule onMount callbacks before afterUpdate callbacks
		add_render_callback(() => {
			const new_on_destroy = on_mount.map(run).filter(is_function);
			if (on_destroy) {
				on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});

		after_render.forEach(add_render_callback);
	}

	function destroy(component, detaching) {
		if (component.$$) {
			run_all(component.$$.on_destroy);
			component.$$.fragment.d(detaching);

			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			component.$$.on_destroy = component.$$.fragment = null;
			component.$$.ctx = {};
		}
	}

	function make_dirty(component, key) {
		if (!component.$$.dirty) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty = {};
		}
		component.$$.dirty[key] = true;
	}

	function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
		const parent_component = current_component;
		set_current_component(component);

		const props = options.props || {};

		const $$ = component.$$ = {
			fragment: null,
			ctx: null,

			// state
			props: prop_names,
			update: noop,
			not_equal: not_equal$$1,
			bound: blank_object(),

			// lifecycle
			on_mount: [],
			on_destroy: [],
			before_render: [],
			after_render: [],
			context: new Map(parent_component ? parent_component.$$.context : []),

			// everything else
			callbacks: blank_object(),
			dirty: null
		};

		let ready = false;

		$$.ctx = instance
			? instance(component, props, (key, value) => {
				if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
					if ($$.bound[key]) $$.bound[key](value);
					if (ready) make_dirty(component, key);
				}
			})
			: props;

		$$.update();
		ready = true;
		run_all($$.before_render);
		$$.fragment = create_fragment($$.ctx);

		if (options.target) {
			if (options.hydrate) {
				$$.fragment.l(children(options.target));
			} else {
				$$.fragment.c();
			}

			if (options.intro && component.$$.fragment.i) component.$$.fragment.i();
			mount_component(component, options.target, options.anchor);
			flush();
		}

		set_current_component(parent_component);
	}

	class SvelteComponent {
		$destroy() {
			destroy(this, true);
			this.$destroy = noop;
		}

		$on(type, callback) {
			const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
			callbacks.push(callback);

			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		$set() {
			// overridden by instance, if it has props
		}
	}

	class SvelteComponentDev extends SvelteComponent {
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error(`'target' is a required option`);
			}

			super();
		}

		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn(`Component was already destroyed`); // eslint-disable-line no-console
			};
		}
	}

	function writable(value, start = noop) {
		let stop;
		const subscribers = [];

		function set(new_value) {
			if (safe_not_equal(value, new_value)) {
				value = new_value;
				if (!stop) return; // not ready
				subscribers.forEach(s => s[1]());
				subscribers.forEach(s => s[0](value));
			}
		}

		function update(fn) {
			set(fn(value));
		}

		function subscribe(run, invalidate = noop) {
			const subscriber = [run, invalidate];
			subscribers.push(subscriber);
			if (subscribers.length === 1) stop = start(set) || noop;
			run(value);

			return () => {
				const index = subscribers.indexOf(subscriber);
				if (index !== -1) subscribers.splice(index, 1);
				if (subscribers.length === 0) stop();
			};
		}

		return { set, update, subscribe };
	}

	/*
	Adapted from https://github.com/mattdesl
	Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
	*/

	function is_date(obj) {
		return Object.prototype.toString.call(obj) === '[object Date]';
	}

	function get_initial_velocity(value) {
		if (typeof value === 'number' || is_date(value)) return 0;

		if (Array.isArray(value)) return value.map(get_initial_velocity);

		if (value && typeof value === 'object') {
			const velocities = {};
			for (const k in value) velocities[k] = get_initial_velocity(value[k]);
			return velocities;
		}

		throw new Error(`Cannot spring ${typeof value} values`);
	}

	function get_threshold(value, target_value, precision) {
		if (typeof value === 'number' || is_date(value)) return precision * Math.abs((target_value - value));

		if (Array.isArray(value)) return value.map((v, i) => get_threshold(v, target_value[i], precision));

		if (value && typeof value === 'object') {
			const threshold = {};
			for (const k in value) threshold[k] = get_threshold(value[k], target_value[k], precision);
			return threshold;
		}

		throw new Error(`Cannot spring ${typeof value} values`);
	}

	function tick_spring(velocity, current_value, target_value, stiffness, damping, multiplier, threshold) {
		let settled = true;
		let value;

		if (typeof current_value === 'number' || is_date(current_value)) {
			const delta = target_value - current_value;
			const spring = stiffness * delta;
			const damper = damping * velocity;

			const acceleration = spring - damper;

			velocity += acceleration;
			const d = velocity * multiplier;

			if (is_date(current_value)) {
				value = new Date(current_value.getTime() + d);
			} else {
				value = current_value + d;
			}

			if (Math.abs(d) > threshold || Math.abs(delta) > threshold) settled = false;
		}

		else if (Array.isArray(current_value)) {
			value = current_value.map((v, i) => {
				const result = tick_spring(
					velocity[i],
					v,
					target_value[i],
					stiffness,
					damping,
					multiplier,
					threshold[i]
				);

				velocity[i] = result.velocity;
				if (!result.settled) settled = false;
				return result.value;
			});
		}

		else if (typeof current_value === 'object') {
			value = {};
			for (const k in current_value) {
				const result = tick_spring(
					velocity[k],
					current_value[k],
					target_value[k],
					stiffness,
					damping,
					multiplier,
					threshold[k]
				);

				velocity[k] = result.velocity;
				if (!result.settled) settled = false;
				value[k] = result.value;
			}
		}

		else {
			throw new Error(`Cannot spring ${typeof value} values`);
		}

		return { velocity, value, settled };
	}

	function spring(value, opts = {}) {
		const store = writable(value);

		const { stiffness = 0.15, damping = 0.8, precision = 0.001 } = opts;
		const velocity = get_initial_velocity(value);

		let task;
		let target_value = value;
		let last_time;
		let settled;
		let threshold;
		let current_token;

		function set(new_value) {
			target_value = new_value;
			threshold = get_threshold(value, target_value, spring.precision);

			const token = current_token = {};

			if (!task) {
				last_time = window.performance.now();
				settled = false;

				task = loop(now => {
					({ value, settled } = tick_spring(
						velocity,
						value,
						target_value,
						spring.stiffness,
						spring.damping,
						(now - last_time) * 60 / 1000,
						threshold
					));

					last_time = now;

					if (settled) {
						value = target_value;
						task = null;
					}

					store.set(value);
					return !settled;
				});
			}

			return new Promise(fulfil => {
				task.promise.then(() => {
					if (token === current_token) fulfil();
				});
			});
		}

		const spring = {
			set,
			update: fn => set(fn(target_value, value)),
			subscribe: store.subscribe,
			stiffness,
			damping,
			precision
		};

		return spring;
	}

	function pannable(node) {
		let x;
		let y;

		function handleMousedown(event) {
			x = event.clientX;
			y = event.clientY;

			node.dispatchEvent(new CustomEvent('panstart', {
				detail: { x, y }
			}));

			window.addEventListener('mousemove', handleMousemove);
			window.addEventListener('mouseup', handleMouseup);
		}

		function handleMousemove(event) {
			const dx = event.clientX - x;
			const dy = event.clientY - y;
			x = event.clientX;
			y = event.clientY;

			node.dispatchEvent(new CustomEvent('panmove', {
				detail: { x, y, dx, dy }
			}));
		}

		function handleMouseup(event) {
			x = event.clientX;
			y = event.clientY;

			node.dispatchEvent(new CustomEvent('panend', {
				detail: { x, y }
			}));

			window.removeEventListener('mousemove', handleMousemove);
			window.removeEventListener('mouseup', handleMouseup);
		}

		node.addEventListener('mousedown', handleMousedown);

		return {
			destroy() {
				node.removeEventListener('mousedown', handleMousedown);
			}
		};
	}

	/* src/Watchlist.svelte generated by Svelte v3.0.0 */

	const file = "src/Watchlist.svelte";

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.symbol = list[i].symbol;
		child_ctx.description = list[i].description;
		child_ctx.bidPrice = list[i].bidPrice;
		child_ctx.askPrice = list[i].askPrice;
		child_ctx.lastPrice = list[i].lastPrice;
		child_ctx.fetchtime = list[i].fetchtime;
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.choice = list[i];
		return child_ctx;
	}

	function get_each_context_2(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.choice = list[i];
		return child_ctx;
	}

	// (161:4) {#each addChoice as choice}
	function create_each_block_2(ctx) {
		var option, option_value_value;

		return {
			c: function create() {
				option = element("option");
				option.__value = option_value_value = ctx.choice;
				option.value = option.__value;
				add_location(option, file, 161, 4, 3515);
			},

			m: function mount(target, anchor) {
				insert(target, option, anchor);
			},

			p: function update(changed, ctx) {
				if ((changed.addChoice) && option_value_value !== (option_value_value = ctx.choice)) {
					option.__value = option_value_value;
				}

				option.value = option.__value;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(option);
				}
			}
		};
	}

	// (170:4) {#each delChoice as choice}
	function create_each_block_1(ctx) {
		var option, option_value_value;

		return {
			c: function create() {
				option = element("option");
				option.__value = option_value_value = ctx.choice;
				option.value = option.__value;
				add_location(option, file, 170, 4, 3765);
			},

			m: function mount(target, anchor) {
				insert(target, option, anchor);
			},

			p: function update(changed, ctx) {
				if ((changed.delChoice) && option_value_value !== (option_value_value = ctx.choice)) {
					option.__value = option_value_value;
				}

				option.value = option.__value;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(option);
				}
			}
		};
	}

	// (194:1) {#each stock as {symbol, description, bidPrice, askPrice, lastPrice, fetchtime}}
	function create_each_block(ctx) {
		var tr, th0, t0_value = ctx.symbol, t0, t1, th1, t2_value = ctx.description, t2, t3, th2, t4_value = ctx.bidPrice, t4, t5, th3, t6_value = ctx.askPrice, t6, t7, th4, t8_value = ctx.lastPrice, t8, t9;

		return {
			c: function create() {
				tr = element("tr");
				th0 = element("th");
				t0 = text(t0_value);
				t1 = space();
				th1 = element("th");
				t2 = text(t2_value);
				t3 = space();
				th2 = element("th");
				t4 = text(t4_value);
				t5 = space();
				th3 = element("th");
				t6 = text(t6_value);
				t7 = space();
				th4 = element("th");
				t8 = text(t8_value);
				t9 = space();
				th0.className = "svelte-y8f01e";
				add_location(th0, file, 195, 2, 4333);
				th1.className = "svelte-y8f01e";
				add_location(th1, file, 196, 2, 4354);
				th2.className = "svelte-y8f01e";
				add_location(th2, file, 197, 2, 4381);
				th3.className = "svelte-y8f01e";
				add_location(th3, file, 198, 2, 4405);
				th4.className = "svelte-y8f01e";
				add_location(th4, file, 199, 2, 4429);
				add_location(tr, file, 194, 1, 4326);
			},

			m: function mount(target, anchor) {
				insert(target, tr, anchor);
				append(tr, th0);
				append(th0, t0);
				append(tr, t1);
				append(tr, th1);
				append(th1, t2);
				append(tr, t3);
				append(tr, th2);
				append(th2, t4);
				append(tr, t5);
				append(tr, th3);
				append(th3, t6);
				append(tr, t7);
				append(tr, th4);
				append(th4, t8);
				append(tr, t9);
			},

			p: function update(changed, ctx) {
				if ((changed.stock) && t0_value !== (t0_value = ctx.symbol)) {
					set_data(t0, t0_value);
				}

				if ((changed.stock) && t2_value !== (t2_value = ctx.description)) {
					set_data(t2, t2_value);
				}

				if ((changed.stock) && t4_value !== (t4_value = ctx.bidPrice)) {
					set_data(t4, t4_value);
				}

				if ((changed.stock) && t6_value !== (t6_value = ctx.askPrice)) {
					set_data(t6, t6_value);
				}

				if ((changed.stock) && t8_value !== (t8_value = ctx.lastPrice)) {
					set_data(t8, t8_value);
				}
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(tr);
				}
			}
		};
	}

	function create_fragment(ctx) {
		var ul, p, t1, div0, input0, t2, datalist0, t3, button0, t5, input1, t6, datalist1, t7, button1, t9, div1, table, tr, th0, t11, th1, t13, th2, t15, th3, t17, th4, t19, pannable_action, dispose;

		var each_value_2 = ctx.addChoice;

		var each_blocks_2 = [];

		for (var i = 0; i < each_value_2.length; i += 1) {
			each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
		}

		var each_value_1 = ctx.delChoice;

		var each_blocks_1 = [];

		for (var i = 0; i < each_value_1.length; i += 1) {
			each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
		}

		var each_value = ctx.stock;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
		}

		return {
			c: function create() {
				ul = element("ul");
				p = element("p");
				p.textContent = "Default Watchlist";
				t1 = space();
				div0 = element("div");
				input0 = element("input");
				t2 = space();
				datalist0 = element("datalist");

				for (var i = 0; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].c();
				}

				t3 = space();
				button0 = element("button");
				button0.textContent = "ADD";
				t5 = space();
				input1 = element("input");
				t6 = space();
				datalist1 = element("datalist");

				for (var i = 0; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].c();
				}

				t7 = space();
				button1 = element("button");
				button1.textContent = "DELETE";
				t9 = space();
				div1 = element("div");
				table = element("table");
				tr = element("tr");
				th0 = element("th");
				th0.textContent = "Symbol";
				t11 = space();
				th1 = element("th");
				th1.textContent = "Descrption";
				t13 = space();
				th2 = element("th");
				th2.textContent = "BidPrice";
				t15 = space();
				th3 = element("th");
				th3.textContent = "AskPrice";
				t17 = space();
				th4 = element("th");
				th4.textContent = "LastPrice";
				t19 = space();

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				p.className = "svelte-y8f01e";
				add_location(p, file, 155, 2, 3347);
				input0.placeholder = "Add Symbol";
				attr(input0, "list", "addChoice");
				add_location(input0, file, 158, 2, 3384);
				datalist0.id = "addChoice";
				add_location(datalist0, file, 159, 2, 3453);
				add_location(button0, file, 165, 3, 3570);
				input1.placeholder = "Delete Symbol";
				attr(input1, "list", "delChoice");
				add_location(input1, file, 167, 2, 3629);
				datalist1.id = "delChoice";
				add_location(datalist1, file, 168, 2, 3703);
				add_location(button1, file, 173, 3, 3819);
				div0.className = "svelte-y8f01e";
				add_location(div0, file, 157, 1, 3376);
				th0.className = "svelte-y8f01e";
				add_location(th0, file, 186, 3, 4121);
				th1.className = "svelte-y8f01e";
				add_location(th1, file, 187, 3, 4142);
				th2.className = "svelte-y8f01e";
				add_location(th2, file, 188, 3, 4167);
				th3.className = "svelte-y8f01e";
				add_location(th3, file, 189, 3, 4190);
				th4.className = "svelte-y8f01e";
				add_location(th4, file, 190, 3, 4213);
				add_location(tr, file, 185, 2, 4113);
				add_location(table, file, 184, 1, 4103);
				div1.className = "box svelte-y8f01e";
				set_style(div1, "transform", "translate(" + ctx.$coords.x + "px," + ctx.$coords.y + "px)\n\t\trotate(" + ctx.$coords.x * 0.2 + "deg)");
				add_location(div1, file, 176, 1, 3894);
				add_location(ul, file, 154, 0, 3340);

				dispose = [
					listen(input0, "input", ctx.input0_input_handler),
					listen(button0, "click", ctx.click_handler),
					listen(input1, "input", ctx.input1_input_handler),
					listen(button1, "click", ctx.click_handler_1),
					listen(div1, "panstart", ctx.handlePanStart),
					listen(div1, "panmove", ctx.handlePanMove),
					listen(div1, "panend", ctx.handlePanEnd)
				];
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, ul, anchor);
				append(ul, p);
				append(ul, t1);
				append(ul, div0);
				append(div0, input0);

				input0.value = ctx.add;

				append(div0, t2);
				append(div0, datalist0);

				for (var i = 0; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].m(datalist0, null);
				}

				append(div0, t3);
				append(div0, button0);
				append(div0, t5);
				append(div0, input1);

				input1.value = ctx.delet;

				append(div0, t6);
				append(div0, datalist1);

				for (var i = 0; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].m(datalist1, null);
				}

				append(div0, t7);
				append(div0, button1);
				append(ul, t9);
				append(ul, div1);
				append(div1, table);
				append(table, tr);
				append(tr, th0);
				append(tr, t11);
				append(tr, th1);
				append(tr, t13);
				append(tr, th2);
				append(tr, t15);
				append(tr, th3);
				append(tr, t17);
				append(tr, th4);
				append(table, t19);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(table, null);
				}

				pannable_action = pannable.call(null, div1) || {};
			},

			p: function update(changed, ctx) {
				if (changed.add) input0.value = ctx.add;

				if (changed.addChoice) {
					each_value_2 = ctx.addChoice;

					for (var i = 0; i < each_value_2.length; i += 1) {
						const child_ctx = get_each_context_2(ctx, each_value_2, i);

						if (each_blocks_2[i]) {
							each_blocks_2[i].p(changed, child_ctx);
						} else {
							each_blocks_2[i] = create_each_block_2(child_ctx);
							each_blocks_2[i].c();
							each_blocks_2[i].m(datalist0, null);
						}
					}

					for (; i < each_blocks_2.length; i += 1) {
						each_blocks_2[i].d(1);
					}
					each_blocks_2.length = each_value_2.length;
				}

				if (changed.delet) input1.value = ctx.delet;

				if (changed.delChoice) {
					each_value_1 = ctx.delChoice;

					for (var i = 0; i < each_value_1.length; i += 1) {
						const child_ctx = get_each_context_1(ctx, each_value_1, i);

						if (each_blocks_1[i]) {
							each_blocks_1[i].p(changed, child_ctx);
						} else {
							each_blocks_1[i] = create_each_block_1(child_ctx);
							each_blocks_1[i].c();
							each_blocks_1[i].m(datalist1, null);
						}
					}

					for (; i < each_blocks_1.length; i += 1) {
						each_blocks_1[i].d(1);
					}
					each_blocks_1.length = each_value_1.length;
				}

				if (changed.stock) {
					each_value = ctx.stock;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block(child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(table, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if (changed.$coords) {
					set_style(div1, "transform", "translate(" + ctx.$coords.x + "px," + ctx.$coords.y + "px)\n\t\trotate(" + ctx.$coords.x * 0.2 + "deg)");
				}
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(ul);
				}

				destroy_each(each_blocks_2, detaching);

				destroy_each(each_blocks_1, detaching);

				destroy_each(each_blocks, detaching);

				if (pannable_action && typeof pannable_action.destroy === 'function') pannable_action.destroy();
				run_all(dispose);
			}
		};
	}

	function constructList(symbols) {
		let stock = [];
		for (let i=0; i<symbols.length; i++) {
			stock.push({symbol: symbols[i], description:'Fetching', bidPrice: 'Fetching', askPrice: 'Fetching', lastPrice: 'Fetching', fetchtime: 1});
		}
		return stock
	}

	function instance($$self, $$props, $$invalidate) {
		let $coords;

		

	  let { symbols } = $$props;


		const coords = spring({ x: 0, y: 0 }, {
			stiffness: 0.2,
			damping: 0.4
		}); validate_store(coords, 'coords'); subscribe($$self, coords, $$value => { $coords = $$value; $$invalidate('$coords', $coords); });

		function handlePanStart() {
			coords.stiffness = coords.damping = 1; $$invalidate('coords', coords);
		}

		function handlePanMove(event) {
			coords.update($coords => ({
				x: $coords.x + event.detail.dx,
				y: $coords.y + event.detail.dy
			}));
		}

		function handlePanEnd(event) {
			coords.stiffness = 0.2; $$invalidate('coords', coords);
			coords.damping = 0.4; $$invalidate('coords', coords);
			coords.set({ x: 0, y: 0 });
		}

	  let add = '';
	  let delet = '';
	  let addResult = [];
		let delResult = [];

		const autoComplete = async (symbol, add) => {
			if (!symbol) {
				return
			}
			const response = await fetch(encodeURI('https://api.tastyworks.com/symbols/search/' + symbol));
			const des = await response.json();
			const options = des.data.items;
			if (add) {
				$$invalidate('addResult', addResult = []);
				for (let i=0; i<options.length; i++) {
					addResult.push((options[i].symbol + ":  " + options[i].description));
				}
			} else {
				$$invalidate('delResult', delResult = []);
				for (let i=0; i<options.length; i++) {
					delResult.push(options[i].symbol);
				}
			}

		};

		const fetchDescription = async (stock) => {
			const symbol = stock.symbol;
			const response = await fetch(encodeURI('https://api.tastyworks.com/symbols/search/' + symbol));
			const des = await response.json();
			if (des.data.items[0]) {
				stock.description = des.data.items[0].description;
			} else {
				stock.description = 'unknown symbol';
			}
		};

	  const fetchBook = async (stock) => {
			const symbol = stock.symbol;
			let response = dxFeed.getQuote(symbol);
			stock.bidPrice = response.bid;
			stock.askPrice = response.ask;
			stock.lastPrice = response.last;
		};

		const addSymbol = (event, symbol) => {
			let s = symbol.split(':')[0];
			stock.push({symbol: s, description:'Fetching', bidPrice: 'Fetching', askPrice: 'Fetching', lastPrice: 'Fetching', fetchtime: 1});
		};

		const deleteSymbol = (event, symbol) => {
			for (let i=0; i<stock.length; i++) {
				if (stock[i].symbol == symbol) {
					stock.splice( i, 1 );
				}
			}
		};

		onMount(() => {
			constructList(symbols);
			if (stock[0]) {
				stock[0].fetchtime += 1; $$invalidate('stock', stock);
			}
		const interval = setInterval(() => {
			autoComplete(add, true);
			autoComplete(delet, false);
			for (let i = 0; i < stock.length; i++) {
				fetchDescription(stock[i]);
				fetchBook(stock[i]);
				stock[i].fetchtime += 1; $$invalidate('stock', stock);
			}
		}, 2000);

		return () => {
			clearInterval(interval);
		};
	});

		function input0_input_handler() {
			add = this.value;
			$$invalidate('add', add);
		}

		function click_handler(e) {
			return addSymbol(e, add);
		}

		function input1_input_handler() {
			delet = this.value;
			$$invalidate('delet', delet);
		}

		function click_handler_1(e) {
			return deleteSymbol(e, delet);
		}

		$$self.$set = $$props => {
			if ('symbols' in $$props) $$invalidate('symbols', symbols = $$props.symbols);
		};

		let stock, addChoice, delChoice;
		$$self.$$.update = ($$dirty = { symbols: 1, addResult: 1, delResult: 1 }) => {
			if ($$dirty.symbols) { $$invalidate('stock', stock = constructList(symbols)); }
			if ($$dirty.addResult) { $$invalidate('addChoice', addChoice = addResult); }
			if ($$dirty.delResult) { $$invalidate('delChoice', delChoice = delResult); }
		};

		return {
			symbols,
			coords,
			handlePanStart,
			handlePanMove,
			handlePanEnd,
			add,
			delet,
			addSymbol,
			deleteSymbol,
			stock,
			addChoice,
			delChoice,
			$coords,
			input0_input_handler,
			click_handler,
			input1_input_handler,
			click_handler_1
		};
	}

	class Watchlist extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment, safe_not_equal, ["symbols"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.symbols === undefined && !('symbols' in props)) {
				console.warn("<Watchlist> was created without expected prop 'symbols'");
			}
		}

		get symbols() {
			throw new Error("<Watchlist>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set symbols(value) {
			throw new Error("<Watchlist>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/App.svelte generated by Svelte v3.0.0 */

	const file$1 = "src/App.svelte";

	function get_each_context$1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.name = list[i];
		child_ctx.i = i;
		return child_ctx;
	}

	// (57:1) {#each nameList as name, i}
	function create_each_block$1(ctx) {
		var li, t0_value = ctx.name, t0, t1, a, dispose;

		function click_handler(...args) {
			return ctx.click_handler(ctx, ...args);
		}

		function click_handler_1(...args) {
			return ctx.click_handler_1(ctx, ...args);
		}

		return {
			c: function create() {
				li = element("li");
				t0 = text(t0_value);
				t1 = space();
				a = element("a");
				a.textContent = "✘";
				a.className = "svelte-1554kc9";
				add_location(a, file$1, 59, 2, 1020);
				li.className = "svelte-1554kc9";
				add_location(li, file$1, 57, 2, 975);

				dispose = [
					listen(a, "click", click_handler),
					listen(li, "click", click_handler_1)
				];
			},

			m: function mount(target, anchor) {
				insert(target, li, anchor);
				append(li, t0);
				append(li, t1);
				append(li, a);
			},

			p: function update(changed, new_ctx) {
				ctx = new_ctx;
				if ((changed.nameList) && t0_value !== (t0_value = ctx.name)) {
					set_data(t0, t0_value);
				}
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(li);
				}

				run_all(dispose);
			}
		};
	}

	function create_fragment$1(ctx) {
		var ul, t0, li, t2, current, dispose;

		var each_value = ctx.nameList;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
		}

		var watchlist = new Watchlist({
			props: { symbols: ctx.symbolList[ctx.currentIdx] },
			$$inline: true
		});

		return {
			c: function create() {
				ul = element("ul");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t0 = space();
				li = element("li");
				li.textContent = "➕ Add Watchlist";
				t2 = space();
				watchlist.$$.fragment.c();
				li.className = "svelte-1554kc9";
				add_location(li, file$1, 63, 1, 1078);
				ul.className = "svelte-1554kc9";
				add_location(ul, file$1, 55, 0, 939);
				dispose = listen(li, "click", ctx.click_handler_2);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, ul, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(ul, null);
				}

				append(ul, t0);
				append(ul, li);
				insert(target, t2, anchor);
				mount_component(watchlist, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.nameList) {
					each_value = ctx.nameList;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$1(child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(ul, t0);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				var watchlist_changes = {};
				if (changed.symbolList || changed.currentIdx) watchlist_changes.symbols = ctx.symbolList[ctx.currentIdx];
				watchlist.$set(watchlist_changes);
			},

			i: function intro(local) {
				if (current) return;
				watchlist.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				watchlist.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(ul);
				}

				destroy_each(each_blocks, detaching);

				if (detaching) {
					detach(t2);
				}

				watchlist.$destroy(detaching);

				dispose();
			}
		};
	}

	function instance$1($$self, $$props, $$invalidate) {
		let currentIdx = 0;
		const changeIdx = (index) => {
			$$invalidate('currentIdx', currentIdx = index);
		};

		let symbolList = [['AAPL', 'MSFT', 'SPX'], ['AAPL'], []];
	  let nameList = ['Default Watchlist', 'AAPL Watchlist', 'Empty Watchlist'];

		const addPage = () => {
			symbolList.push([]);
			nameList.push('New Page');
			$$invalidate('nameList', nameList);
			$$invalidate('symbolList', symbolList);
		};
	  const removePage = (i) => {
			symbolList.splice( i, 1 );
			nameList.splice( i, 1 );
			$$invalidate('nameList', nameList);
			$$invalidate('symbolList', symbolList);
		};

		function click_handler({ i }, e) {
			return removePage(i);
		}

		function click_handler_1({ i }, e) {
			return changeIdx(i);
		}

		function click_handler_2(e) {
			return addPage();
		}

		return {
			currentIdx,
			changeIdx,
			symbolList,
			nameList,
			addPage,
			removePage,
			click_handler,
			click_handler_1,
			click_handler_2
		};
	}

	class App extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$1, create_fragment$1, safe_not_equal, []);
		}
	}

	const app = new App({
		target: document.body,
		props: {
			name: 'world'
		}
	});

	return app;

}());
//# sourceMappingURL=bundle.js.map
