// Test entry for `node --test server/`. On Node 24 a directory argument is not
// scanned for test files; it is resolved like a module, i.e. to this file.
// Every test file must be listed here. (Running `node --test server/test/*.test.mjs`
// directly also works.)
import './test/auth.test.mjs';
import './test/save-profile.test.mjs';
import './test/plaza.test.mjs';
import './test/social.test.mjs';
import './test/static.test.mjs';
import './test/limits.test.mjs';
