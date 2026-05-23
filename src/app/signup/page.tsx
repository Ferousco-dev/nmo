// Signup is dead — login via Skool credentials is the only entry point.
// Any inbound link to /signup just redirects to /login.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  redirect('/login');
}
