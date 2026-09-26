# Salad Soulmates password-reset email

Use this as the **Reset Password** template in Supabase Auth. It sends the
recipient to the app's server-side confirmation route, which verifies the token
and then opens the public password-reset page.

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7f2;color:#193a2a;font-family:Arial,sans-serif;">
    <main
      style="max-width:560px;margin:32px auto;background:#ffffff;padding:36px;border-radius:12px;"
    >
      <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;color:#1f563d;">
        Salad Soulmates
      </p>
      <h1 style="margin:0 0 18px;font-size:26px;">Reset your password</h1>
      <p>Use the secure link below to choose a new password.</p>
      <p style="margin:28px 0;">
        <a
          href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery"
          style="display:inline-block;padding:12px 18px;background:#1f563d;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;"
          >Reset password</a
        >
      </p>
      <p style="font-size:13px;color:#52665b;">
        If you did not request this, you can safely ignore this email.
      </p>
    </main>
  </body>
</html>
```

In Supabase **Authentication → URL Configuration**, add this exact redirect URL:

`https://salad-soulmates.vercel.app/auth/confirm?next=/reset-password`

Use this template only after the deployment containing `/auth/confirm` is live.
