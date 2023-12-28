export default function Home() {
  const clickHandler = async () => {
    // store the next path in session storage
    sessionStorage.setItem('next', '/protected')
    // trigger the login flow. It simply calls the login endpoint
    window.location.href = import.meta.env.VITE_API_URI_LOGIN as string
  }

  return (
    <>
      <p class="pb-4 text-2xl tracking-wide">Take a peek into the protected area</p>
      <button
        onClick={clickHandler}
        class="text-xl, m-2 bg-neutral-600 px-5 py-2 tracking-wider ring-2 ring-purple-500 ring-offset-4 ring-offset-slate-900"
      >
        Login
      </button>
    </>
  )
}
