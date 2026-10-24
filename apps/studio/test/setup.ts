import { configure } from '@testing-library/react';

// Page tests do real file I/O and render Radix-based @ap/ui controls; under full-suite CI load one wait can pass
// the 1 s default (#88).
configure({ asyncUtilTimeout: 5000 });
