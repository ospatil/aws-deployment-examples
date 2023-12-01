import { useNavigate } from '@solidjs/router'

export default function Home() {
  const navigate = useNavigate()

  const clickHandler = async () => {
    navigate('/protected', { replace: true })
  }

  return (
    <>
      <p class="text-2xl tracking-wide pb-4">Take a peek into the protected area</p>
      <button
        onClick={clickHandler}
        class="m-2 px-5 py-2 text-xl, tracking-wider ring-2 bg-neutral-600 ring-purple-500 ring-offset-4 ring-offset-slate-900"
      >
        Let's go!
      </button>
    </>
  )
}
