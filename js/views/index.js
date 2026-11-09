// views/index.js — the list of main screens, in bottom-bar order.
//
// TO ADD A SCREEN (e.g. Meteor Showers, Launches):
//   1. create views/yourscreen.js exporting { id, title, icon, mount(el, ctx, params), tick(ctx), unmount() }
//   2. import it here and add it to the `views` array.
// The bottom bar builds itself from this list.

import { tonightView } from './tonight.js';
import { issView } from './iss.js';
import { pointView } from './point.js';

export const views = [tonightView, issView, pointView];
