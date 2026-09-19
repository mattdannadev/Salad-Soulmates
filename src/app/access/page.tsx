import { signOut } from '../actions';

export default function Access() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Access pending</h1>
        <p>
          Your sign-in worked. An administrator needs to assign your organization, facility, and
          role.
        </p>
        <p>Tu cuenta necesita acceso. Contacta a tu administrador.</p>
        <form action={signOut}>
          <button type="submit">Sign out / Salir</button>
        </form>
      </section>
    </main>
  );
}
