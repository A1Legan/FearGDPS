import IConfig from "./IConfig";
import { Collection } from "discord.js";

export default interface ICustomClient {
    config: IConfig;
    commands: Collection<string, any>;
    Init(): void;
}