import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
            <div className="mb-6">
                <i className='bx bx-map-alt text-6xl text-slate-300 animate-bounce'></i>
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">404: 경로 탐색 실패</h2>
            <p className="text-slate-500 font-bold mb-8 uppercase text-[11px] tracking-widest">요청하신 페이지를 찾을 수 없습니다.</p>
            <Link href="/" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all">
                대시보드로 복귀
            </Link>
        </div>
    );
}