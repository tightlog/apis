type BindingsWithWrongType<Generated, Declared> = {
  [
    Key in keyof Generated & keyof Declared
  ]: Generated[Key] extends Declared[Key] ? never : Key;
}[keyof Generated & keyof Declared];

export type EnvCheck<Generated, Declared, Extra extends PropertyKey = never> = [
  Exclude<keyof Generated, keyof Declared | Extra>,
] extends [never]
  ? [BindingsWithWrongType<Generated, Declared>] extends [never]
    ? true
    : { bindingsWithWrongType: BindingsWithWrongType<Generated, Declared> }
  : {
      bindingsMissingFromEnvType: Exclude<
        keyof Generated,
        keyof Declared | Extra
      >;
    };
