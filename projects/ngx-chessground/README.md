# NgxChessground

[![npm version](https://badge.fury.io/js/ngx-chessground.svg)](https://badge.fury.io/js/ngx-chessground)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)

Angular wrapper for [ornicar/chessground](https://github.com/ornicar/chessground), the premier open-source chess UI library.

## Demo

Check out the live demo at [https://topce.github.io/ngx-chessground/](https://topce.github.io/ngx-chessground/)

## Installation

```bash
npm install ngx-chessground chess.js chessground snabbdom
```

## Usage

Import the module in your application:

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

In your component:

```typescript
import { Component, OnInit } from '@angular/core';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';

@Component({
  selector: 'app-chessboard',
  templateUrl: './chessboard.component.html'
})
export class ChessboardComponent implements OnInit {
  config: Config = {
    orientation: 'white',
    movable: {
      free: false,
      color: 'both',
      dests: new Map(),
      showDests: true
    }
  };
  
  groundApi: Api = null;
  
  ngOnInit() {
    // You can setup your board here
  }
  
  onBoardInitialized(api: Api) {
    this.groundApi = api;
    // Now you can use the API to manipulate the board
  }
}
```

## API

This library wraps all the functionality from chessground. For detailed API information, please refer to the [chessground documentation](https://github.com/ornicar/chessground).

### Components

- `NgxChessgroundComponent` - Basic chessground board
- `NgxChessgroundTableComponent` - Chessboard with table styling

### Inputs

- `width` - Board width in pixels
- `height` - Board height in pixels
- `config` - Chessground configuration object
- `style` - Additional CSS styles for the board container

### Events

- `boardInitialized` - Emitted when the board is initialized, passes the chessground API

## License

GPL-3.0 or later
