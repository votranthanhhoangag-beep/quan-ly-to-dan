import { useNavigate } from 'react-router-dom';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-red-600">403 - Access Denied</p>
        <h1 className="mb-3 text-2xl font-bold text-slate-900">Từ chối truy cập</h1>
        <p className="mb-8 text-sm leading-6 text-slate-600">
          Bạn không có quyền truy cập trang này
        </p>

        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Quay lại Bảng điều khiển
        </button>
      </section>
    </main>
  );
}