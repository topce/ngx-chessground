# NgxChessground

[![npm version](https://badge.fury.io/js/ngx-chessground.svg)](https://badge.fury.io/js/ngx-chessground)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)

Angular wrapper for [ornicar/chessground](https://github.com/ornicar/chessground), the premier open-source chess UI library.

## Demo

Check out the live demo at [https://topce.github.io/ngx-chessground/](https://topce.github.io/ngx-chessground/)

## Features

- Complete Angular wrapper for chessground
- Easy integration with Angular applications
- All features from the original chessground library
- Compatible with Angular 20
- Enhanced examples with game replay functionality

## Repository Structure

This repository contains two Angular projects:

1. **ngx-chessground** - Angular library that wraps the chessground chess UI
2. **ngx-chessground-example** - Demo application with various examples, including:
   - All examples from the original chessground-examples repository
   - Game replay with different time controls:
     - One second per move
     - Real-time replay
     - Proportional replay (fit to one minute)
   - Option to play against yourself (like Robert James Fischer)

## Installation

### For Users

Install the library in your Angular project:

```bash
npm install ngx-chessground chess.js chessground snabbdom
```

### For Contributors

Clone and set up the development environment:

```bash
git clone https://github.com/topce/ngx-chessground.git
cd ngx-chessground
npm install
npm start
```

## Documentation

To generate and view the documentation:

```bash
npm run compodoc
```

This will start a documentation server at http://localhost:9090

## Usage

```typescript
import { NgxChessgroundModule } from 'ngx-chessground';

@NgModule({
  imports: [
    NgxChessgroundModule
  ]
})
export class AppModule { }
```

Then in your component template:

```html
<ngx-chessground
  [width]="400"
  [height]="400"
  [config]="config">
</ngx-chessground>
```

## Publishing

To publish the library to npm:

```bash
npm run publish:lib
```

Or use the PowerShell script for a guided publishing process:

```powershell
.\publish.ps1
```

## Version Compatibility

| NgxChessground | Angular    |
|----------------|------------|
| 20.x           | 20.x       |
| 19.x           | 19.x       |
| 18.x           | 18.x       |
| 17.x           | 17.x       |
| 16.x           | 16.x       |
| 15.x           | 15.x       |

## Roadmap

- Create Angular components for online playing (piece promotion in progress)
- Develop a full-featured Angular PGN viewer
- Add comprehensive testing suite
- Enhance accessibility features

## License

GPL-3.0 or later

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
