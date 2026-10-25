"use client";

import Link from "next/link";
import { useLoggedIn } from "@/lib/useLoggedIn";

const STEPS = [
  {
    title: "Staff upload documents",
    text: "Faculty and admins upload circulars, regulations, syllabi and notices as PDFs. Scanned pages are read automatically.",
  },
  {
    title: "CampusMind learns them",
    text: "Each document is split into small passages and indexed by meaning, so the right passage is found even when the question uses different words.",
  },
  {
    title: "Students ask, with proof",
    text: "Ask in plain English. You get a short answer and its source, or an honest 'I couldn't find this' when the documents do not say.",
  },
];

const FEATURES = [
  {
    title: "Every answer has a source",
    text: "See the document, the page and the passage an answer came from, so you can check it yourself.",
  },
  {
    title: "It never guesses",
    text: "If the documents do not contain the answer, CampusMind says so instead of making something up.",
  },
  {
    title: "Right documents, right people",
    text: "Documents can stay private to a department or be shared with the whole college.",
  },
  {
    title: "Works with scanned PDFs",
    text: "Photographed or scanned circulars are read with OCR, so older notices count too.",
  },
];

export default function Home() {
  const loggedIn = useLoggedIn();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-xl font-bold text-indigo-700">CampusMind</span>
        <nav className="flex items-center gap-3 text-sm">
          {loggedIn ? (
            <Link href="/chat" className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
              Open CampusMind
            </Link>
          ) : (
            <>
              <Link href="/login" className="font-medium text-slate-700 hover:text-indigo-700">
                Log in
              </Link>
              <Link href="/signup" className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
                Sign up free
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="bg-gradient-to-b from-indigo-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Ask your college documents anything.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            CampusMind answers student questions from official circulars, regulations and syllabi, and shows the source of
            every answer. If the answer is not in the documents, it tells you instead of guessing.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {loggedIn ? (
              <Link href="/chat" className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700">
                Open CampusMind
              </Link>
            ) : (
              <>
                <Link href="/signup" className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700">
                  Sign up free
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  I already have an account
                </Link>
              </>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-500">Free to use. Sign up takes under a minute.</p>

          <div className="mx-auto mt-12 max-w-xl rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Example from the demo</p>
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-white">
                How many books can a student borrow at a time?
              </div>
            </div>
            <div className="mt-3 rounded-2xl rounded-bl-sm border border-slate-200 px-4 py-3">
              <p>A student may borrow a maximum of 3 books at a time [1].</p>
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold text-indigo-700">[1]</span> Sample Library Rules · page 1 ·{" "}
                <span className="text-slate-400">68% match</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-xl border border-slate-200 p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                {i + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-slate-600">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">Built to be trusted</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h2 className="text-3xl font-bold">Try it now</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Create a free account and ask the demo document a question. New accounts are students and can ask questions;
          uploading documents is for faculty and admins.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href={loggedIn ? "/chat" : "/signup"}
            className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
          >
            {loggedIn ? "Open CampusMind" : "Sign up free"}
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        Built by Kamlesh J ·{" "}
        <a
          href="https://github.com/KamleshJayasankar/campusmind"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-indigo-700 hover:underline"
        >
          View the source on GitHub
        </a>
        <p className="mt-1">The first load can take about a minute while the free server wakes up.</p>
      </footer>
    </div>
  );
}
