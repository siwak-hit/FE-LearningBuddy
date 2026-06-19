import * as UtilsModule from './buddy/utils.js';
import * as ScannerModule from './buddy/scanner.js';
import * as ChatModule from './buddy/chat.js';
import * as DomUiModule from './buddy/dom-ui.js';
import * as SessionModule from './buddy/session.js';
import * as EventsModule from './buddy/events.js';
import * as InitModule from './buddy/init.js';
import * as MentionsModule from './buddy/mentions.js';
import * as OnboardingModule from './buddy/onboarding.js';
import * as TemplatePreviewModule from './buddy/template-preview.js';
import * as ManualContextModule from './buddy/manual-context-selector.js';
import * as ComplaintModule from './buddy/complaint-builder.js';
import * as IdentityFallbackModule from './buddy/identity-fallback.js';
import * as ReminderToastModule from './buddy/reminder-toast.js';

// Penggabungan Object (Object Composition) dari kumpulan library
const BuddyPage = {
  ...UtilsModule,
  ...ScannerModule,
  ...ChatModule,
  ...DomUiModule,
  ...SessionModule,
  ...EventsModule,
  ...InitModule,
  ...MentionsModule,
  ...OnboardingModule,
  ...TemplatePreviewModule,
  ...ManualContextModule,
  ...ComplaintModule,
  ...IdentityFallbackModule,
  ...ReminderToastModule
};

export default BuddyPage;
