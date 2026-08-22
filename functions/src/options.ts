import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";

// Must run before any onCall/onRequest is defined.
//
// ES module imports are hoisted and evaluated in source order, so calling
// setGlobalOptions at the top of index.ts did NOT work: the `export ... from
// "./join.js"` re-exports below it were evaluated first, defining every
// function before the region was ever set. They all silently fell back to the
// default us-central1 while the client called a different region entirely.
//
// Keeping this in its own module, imported first by index.ts, guarantees the
// ordering regardless of how the exports below it are arranged.
//
// Region matches the Firestore database (australia-southeast1). Co-locating
// compute with data avoids a cross-planet round trip on every query.
export const FUNCTIONS_REGION = "australia-southeast1";

initializeApp();
setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });
