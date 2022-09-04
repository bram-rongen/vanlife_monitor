import noble from "@abandonware/noble";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";

import logger from "./logger";

type BatteryStateData = {
  voltage: number;
  current: number;
  temp1: number;
  temp2: number;
  charge: number;
  full: number;
  charge_on: boolean;
  discharge_on: boolean;
};

type CellStateData = {
  numcells: number;
  cells: number[];
};

type BatteryInfoData = {
  name: string;
};

type MessageEvents = {
  batteryState: (data: BatteryStateData) => void;
  cellState: (data: CellStateData) => void;
  batteryInfo: (data: BatteryInfoData) => void;
};

const commands = {
  discharge_on: [0xdd, 0x5a, 0xe1, 0x02, 0x00, 0x00, 0xff, 0x1d, 0x77],
  discharge_off: [0xdd, 0x5a, 0xe1, 0x02, 0x00, 0x02, 0xff, 0x1b, 0x77],
  charge_on: [0xdd, 0x5a, 0xe1, 0x02, 0x00, 0x00, 0xff, 0x1d, 0x77],
  charge_off: [0xdd, 0x5a, 0xe1, 0x02, 0x00, 0x01, 0xff, 0x1c, 0x77],
  request_read: [0xdd, 0xa5, 0x03, 0x00, 0xff, 0xfd, 0x77],
  request_cell_voltage: [0xdd, 0xa5, 0x04, 0x00, 0xff, 0xfc, 0x77],
  request_info: [0xdd, 0xa5, 0x05, 0x00, 0xff, 0xfb, 0x77],
};

const decodeBatteryStateData = (buffer: Buffer): BatteryStateData => {
  return {
    voltage: buffer.readInt16BE(4) / 100,
    current: buffer.readInt16BE(6) / 100,

    temp1: buffer.readInt16BE(27) / 10 - 273.15,
    temp2: buffer.readInt16BE(29) / 10 - 273.15,

    charge: buffer.readInt16BE(8),
    full: buffer.readInt16BE(10),
    charge_on: Boolean(buffer[24] & 1),
    discharge_on: Boolean(buffer[24] & 2),
  };
};

const decodeCellStateData = (buffer: Buffer): CellStateData => {
  const numcells = buffer.readInt16BE(2) / 2;
  const result: { numcells: number; cells: number[] } = {
    numcells,
    cells: [],
  };
  for (let i = 0; i < numcells; i++) {
    result["cells"][i] = buffer.readInt16BE(i * 2 + 4);
  }

  return result;
};

const decodeBatteryInfoData = (buffer: Buffer): BatteryInfoData => {
  const trimmed = buffer.subarray(4, buffer.length - 4);
  return { name: trimmed.toString() };
};

class UltimatronBMS {
  readChar: noble.Characteristic | undefined;
  writeChar: noble.Characteristic | undefined;
  batteryReadHandle: NodeJS.Timer | undefined;
  cellReadHandle: NodeJS.Timer | undefined;
  connected = false;
  shouldBeConnected = false;
  messageEmitter = new EventEmitter() as TypedEmitter<MessageEvents>;

  constructor(localName: string) {
    noble.on("stateChange", async () => {
      if (noble.state == "poweredOn" && this.shouldBeConnected) {
        noble.startScanningAsync();
      }
    });

    noble.on("scanStart", () => {
      logger.info("Started scanning");
    });

    noble.on("discover", async (peripheral) => {
      if (peripheral.advertisement.localName !== localName) return;

      logger.info(`Device ${localName} discovered`);
      noble.stopScanningAsync();

      await peripheral.connectAsync();

      logger.info("Connected to device");

      const { characteristics } =
        await peripheral.discoverAllServicesAndCharacteristicsAsync();
      this.readChar = characteristics.find((char) => char.uuid == "ff01");
      this.writeChar = characteristics.find((char) => char.uuid == "ff02");

      if (!this.readChar || !this.writeChar) {
        throw new Error(
          `Read or write character not found on BLE device ${localName}`
        );
      }

      let buffer = Buffer.from([]);
      this.readChar.on("data", (data) => {
        //Collect buffer and compose data
        buffer = Buffer.concat([buffer, data]);

        if (buffer.length > 4) {
          if (buffer[0] === 221 && buffer[buffer.length - 1] === 119) {
            const command = buffer[1];
            try {
              switch (command) {
                case 3:
                  this.messageEmitter.emit(
                    "batteryState",
                    decodeBatteryStateData(buffer)
                  );
                  break;
                case 4:
                  this.messageEmitter.emit(
                    "cellState",
                    decodeCellStateData(buffer)
                  );
                  break;
                case 5:
                  this.messageEmitter.emit(
                    "batteryInfo",
                    decodeBatteryInfoData(buffer)
                  );
                  break;
                default:
                  logger.warn(`no decoder for command ${command}`);
                  logger.debug(buffer);
              }
            } catch (error) {
              logger.error("unable to decode buffer", buffer);
            }

            buffer = Buffer.from([]);
          }
        }
      });
      this.readChar.subscribe();
    });
  }

  startScanning() {
    this.shouldBeConnected = true;

    if (noble.state == "poweredOn") {
      noble.startScanningAsync();
    }
  }

  sendCommand(command: keyof typeof commands) {
    if (this.writeChar)
      this.writeChar.write(Buffer.from(commands[command]), true);
  }

  startReadingBatteryState(intervalMs: number) {
    if (this.batteryReadHandle) return;

    this.batteryReadHandle = setInterval(() => {
      this.sendCommand("request_read");
    }, intervalMs);
  }

  stopReadingBatteryState() {
    if (this.batteryReadHandle) {
      clearInterval(this.batteryReadHandle);
      this.batteryReadHandle = undefined;
    }
  }

  startReadingCellState(intervalMs: number) {
    if (this.cellReadHandle) return;

    this.cellReadHandle = setInterval(() => {
      this.sendCommand("request_cell_voltage");
    }, intervalMs);
  }

  stopReadingCellState() {
    if (this.cellReadHandle) {
      clearInterval(this.cellReadHandle);
      this.cellReadHandle = undefined;
    }
  }

  requestBatteryInfo() {
    this.sendCommand("request_info");
  }

  setCharge(on: boolean) {
    on ? this.sendCommand("charge_on") : this.sendCommand("charge_off");
  }

  setDischarge(on: boolean) {
    on ? this.sendCommand("discharge_on") : this.sendCommand("discharge_off");
  }
}

export default UltimatronBMS;
