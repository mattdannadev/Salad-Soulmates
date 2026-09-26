# Salad Soulmates sign-up confirmation email

Salad Soulmates normally provisions accounts through administrator invitations,
not public sign-up. If Supabase email confirmation is enabled for a sign-up flow,
use this as the **Confirm signup** template so it works with the app's server-side
confirmation route.

```html
<p>Welcome to Salad Soulmates.</p>
<p>
  <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
</p>
```

The redirect URL passed to Supabase must be an allow-listed `/auth/confirm` URL.
For a sign-up flow that should finish in the app, use a route such as:

`https://salad-soulmates.vercel.app/auth/confirm?next=/app`

Do not enable public sign-up unless the app has an explicit, reviewed onboarding
and organization-assignment flow; email confirmation alone does not grant a
person access to an organization.
