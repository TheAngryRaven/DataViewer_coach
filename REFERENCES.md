# References

Eye in the Sky's analysis encodes established racing and data-engineering
practice — not guesswork. This file is the project's **loose citations** list:
the sources behind our metrics and heuristics.

Citations here are intentionally loose. The bar is: name the author and the work
(a year is fine) so a reader can find it — but **no page numbers, ISBNs, or
DOIs**, and we don't reproduce quotes. Driver philosophy is cited only from books
a driver actually wrote. See `CLAUDE.md` → "References & citations" for the rule
that keeps new code tied to this list.

## Racing line, apex & corner technique

- **Carl Lopez / Skip Barber Racing School — _Going Faster! Mastering the Art of
  Race Driving_.** The school's curriculum text: corner phases, the line,
  slow-in/fast-out, exit priority.
- **Ross Bentley — _Speed Secrets_ / _Ultimate Speed Secrets_** (and
  speedsecrets.com). Minimum corner speed ("MIN speed") and its location, exit
  speed, practical coaching.
- **Adam Brouillard — _The Perfect Corner_** (Science of Speed series). A
  physics-first treatment of why the time-optimal apex is *later* than the
  geometric apex on corners leading onto a straight.
- **Carroll Smith — _Drive to Win_.** Tyre-load and slow-in/fast-out reasoning
  from a race engineer.
- **Piero Taruffi — _The Technique of Motor Racing_.** Early formal treatment of
  the geometric line.
- **Driver61 / Scott Mansell — driver61.com** coaching guides (racing line, trail
  braking, corner phases, prioritising corners).

## Lap-time optimization (minimum-curvature vs minimum-time)

The basis for our apex-offset metric (V-Min vs the geometric/curvature apex): the
time-optimal line is *not* the minimum-curvature line, and it places the
minimum-speed point later than the geometric apex on corners onto straights.

- **Heilmeier, Wischnewski, Hermansdorfer, Betz, Lienkamp, Lohmann — "Minimum
  curvature trajectory planning and control for an autonomous race car"**
  (Vehicle System Dynamics, 2020).
- **Braghin, Cheli, Melzi, Sabbioni — "Race driver model"** (Computers &
  Structures, 2008).
- **Kapania, Subosits, Gerdes — "A Sequential Two-Step Algorithm for Fast
  Generation of Vehicle Racing Trajectories"** (2016).
- **Lot, Biral — "A Curvilinear Abscissa Approach for the Lap Time Optimization
  of Racing Vehicles"** (IFAC, 2014).

## Telemetry analysis & metrics

- **MoTeC i2 documentation** — "Variance" (time delta at equal track distance),
  fastest theoretical lap, fastest rolling lap.
- **AiM RaceStudio** — "Theoretical Best" assembled from the best sector /
  micro-sector splits.
- **Racelogic VBOX / Circuit Tools** — GPS data analysis; Doppler-derived speed;
  two-lap comparison by GPS position.
- **Jorge Segers — _Analysis Techniques for Racecar Data Acquisition_** (SAE).
  The standard engineering reference for logger data.

## Driver-authored references (philosophy: smoothness, consistency)

Cited only where a driver actually wrote the book; we do not reproduce quotes.

- **Jackie Stewart — _Faster!_** (smoothness / mechanical sympathy).
- **Niki Lauda — _The Art and Science of Grand Prix Driving_** (driver-authored
  technique).
- **Jim Clark — _Jim Clark at the Wheel_.**
- **Alain Prost — _Competition Driving_.**

## What grounds what (code → source)

| Code / metric | Source(s) |
| --- | --- |
| Corner detection, V-Min (`analysis/corners.ts`) | Bentley (MIN speed & location); apex literature |
| Geometric apex, apex offset (`analysis/curvature.ts`, `analysis/segments.ts`) | Heilmeier 2020; Braghin 2008; Brouillard |
| Corner exit, exit-critical (`analysis/segments.ts`) | _Going Faster!_; Bentley; Driver61 (exit priority) |
| Lap-time consistency (`analysis/debrief.ts`) | Bentley; driver-authored philosophy (Stewart, Lauda) |
| Theoretical best (`analysis/debrief.ts`) | MoTeC i2; AiM RaceStudio |
| Delta-time trace (`analysis/report.ts`, dashboard) | MoTeC i2 ("Variance") |
