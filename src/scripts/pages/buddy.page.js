import * as UtilsModule from './buddy/utils.js';
import * as ScannerModule from './buddy/scanner.js';
import * as ChatModule from './buddy/chat.js';
import * as DomUiModule from './buddy/dom-ui.js';
import * as SessionModule from './buddy/session.js';
import * as EventsModule from './buddy/events.js';
import * as InitModule from './buddy/init.js';

// Penggabungan Object (Object Composition) dari kumpulan library
const BuddyPage = {
  ...UtilsModule,
  ...ScannerModule,
  ...ChatModule,
  ...DomUiModule,
  ...SessionModule,
  ...EventsModule,
  ...InitModule
};

export default BuddyPage;
