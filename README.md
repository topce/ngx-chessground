# NgxChessground

Angular wrapper for ornicar/chessground

Two Angular projects are inside :

ngx-chessground Angular library ( tiny wrapper ) for best open source chess UI library <https://github.com/ornicar/chessground>

ngx-chessground-example copy of <https://github.com/ornicar/chessground-examples>
all examples in original repo works

- add examples to replay game:
- one second per move,
- real time,
- in one minute proportionally
- add option to play against yourself like legendary Robert James Fischer

you can see running application on
<https://topce.github.io/ngx-chessground/>

It uses Angular CLI
to install and run

```console
yarn install
yarn start
```

To see documentation

```console
yarn install
yarn compodoc
```

FUTURE ROADMAP:

- create Angular components for online playing (piece promotion need to be done)
- create Angular pgn viewer
- document library
- improve ugly demo app ngx-chessground-example
- refactor delete not used and eliminate duplicate code
