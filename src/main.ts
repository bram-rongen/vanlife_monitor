import UltimatronBMS from "./lib/UltimatronBMS";
import connectMqtt from "./lib/mqtt";
import settings from "./settings";

export default async () => {
  const bms = new UltimatronBMS(settings.ultimatron);
  const client = await connectMqtt(settings.mqtt.socket, settings.mqtt.mqtt);
  bms.startScanning();
  bms.startReadingBatteryState(5000);
  bms.messageEmitter.on("batteryState", (state) =>
    client.publish("bolife/ultimatron", JSON.stringify({ ...state }))
  );
};
