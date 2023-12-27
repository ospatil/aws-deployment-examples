import { useNavigate } from '@solidjs/router'

export default function Home() {
  const navigate = useNavigate()

  const clickHandler = async () => {
    navigate('/protected', { replace: true })
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
