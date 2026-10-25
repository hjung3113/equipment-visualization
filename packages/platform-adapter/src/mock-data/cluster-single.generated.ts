// generated — do not edit. Source: fixtures/cluster-single (synthetic). Regenerate: pnpm --filter @eqv/platform-adapter gen:mock-data

import type { BindingsFile, EquipmentLayoutDocument, MappingVersion, OccurrenceBatch } from '@eqv/core';

export const layouts: EquipmentLayoutDocument[] = [
  {
    "schemaVersion": "0.4",
    "kind": "equipment-layout",
    "id": "eq-synth-01-layout",
    "templateId": "cluster-single",
    "name": "Synthetic single-hub cluster",
    "unit": "abstract",
    "viewBox": {
      "x": 0,
      "y": 0,
      "width": 100,
      "height": 100
    },
    "sources": [
      {
        "id": "src-synthetic",
        "title": "Synthetic cluster concept; no OEM geometry or kinematics",
        "license": "synthetic"
      }
    ],
    "levels": [
      {
        "id": "level-main",
        "label": "Main",
        "order": 0
      }
    ],
    "components": [
      {
        "id": "lp-a",
        "role": "lp",
        "assetRef": "synthetic-lp",
        "label": "lp-a",
        "levelId": "level-main",
        "transform": {
          "x": 50,
          "y": 90,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 16,
          "height": 8
        },
        "ports": [
          {
            "id": "efem",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "holdingSites": [
          {
            "id": "carrier",
            "materialKinds": [
              "carrier"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "slot-1",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "slot-2",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        }
      },
      {
        "id": "efem-1",
        "role": "efem",
        "assetRef": "synthetic-efem",
        "label": "efem-1",
        "levelId": "level-main",
        "transform": {
          "x": 50,
          "y": 72,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 60,
          "height": 16
        },
        "ports": [
          {
            "id": "lp",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "ll",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "holdingSites": [],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        }
      },
      {
        "id": "efem-robot",
        "role": "robot",
        "assetRef": "synthetic-robot",
        "label": "efem-robot",
        "levelId": "level-main",
        "transform": {
          "x": 0,
          "y": 0,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 8,
          "height": 8
        },
        "ports": [],
        "holdingSites": [
          {
            "id": "blade-a",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "parentId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        },
        "parentId": "efem-1"
      },
      {
        "id": "ll-a",
        "role": "ll",
        "assetRef": "synthetic-ll",
        "label": "ll-a",
        "levelId": "level-main",
        "transform": {
          "x": 50,
          "y": 54,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 12,
          "height": 10
        },
        "ports": [
          {
            "id": "efem",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "tm",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "holdingSites": [
          {
            "id": "slot-1",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "slot-2",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        }
      },
      {
        "id": "tm-1",
        "role": "tm",
        "assetRef": "synthetic-tm",
        "label": "tm-1",
        "levelId": "level-main",
        "transform": {
          "x": 50,
          "y": 32,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 24,
          "height": 24
        },
        "ports": [
          {
            "id": "ll",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "pm-a",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "pm-b",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "holdingSites": [],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        }
      },
      {
        "id": "tm-robot",
        "role": "robot",
        "assetRef": "synthetic-robot",
        "label": "tm-robot",
        "levelId": "level-main",
        "transform": {
          "x": 0,
          "y": 0,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 10,
          "height": 10
        },
        "ports": [],
        "holdingSites": [
          {
            "id": "blade-a",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "blade-b",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "parentId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        },
        "parentId": "tm-1"
      },
      {
        "id": "pm-a",
        "role": "pm",
        "assetRef": "synthetic-pm",
        "label": "pm-a",
        "levelId": "level-main",
        "transform": {
          "x": 24,
          "y": 32,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 18,
          "height": 18
        },
        "ports": [
          {
            "id": "tm",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "holdingSites": [
          {
            "id": "station-1",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        }
      },
      {
        "id": "pm-b",
        "role": "pm",
        "assetRef": "synthetic-pm",
        "label": "pm-b",
        "levelId": "level-main",
        "transform": {
          "x": 76,
          "y": 32,
          "rotation": 0,
          "scale": 1
        },
        "size": {
          "width": 18,
          "height": 18
        },
        "ports": [
          {
            "id": "tm",
            "position": {
              "x": 0,
              "y": 0
            },
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "holdingSites": [
          {
            "id": "station-1",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          },
          {
            "id": "station-2",
            "materialKinds": [
              "wafer"
            ],
            "provenance": {
              "certainty": "assumed",
              "sourceEvidence": [
                "src-synthetic"
              ]
            }
          }
        ],
        "provenance": {
          "role": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "assetRef": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "label": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "levelId": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "transform": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          },
          "size": {
            "certainty": "assumed",
            "sourceEvidence": [
              "src-synthetic"
            ]
          }
        }
      }
    ],
    "physicalInterfaces": [
      {
        "id": "lp-a-efem-1",
        "kind": "docking",
        "a": {
          "componentId": "lp-a",
          "portId": "efem"
        },
        "b": {
          "componentId": "efem-1",
          "portId": "lp"
        },
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "efem-1-ll-a",
        "kind": "gate",
        "a": {
          "componentId": "efem-1",
          "portId": "ll"
        },
        "b": {
          "componentId": "ll-a",
          "portId": "efem"
        },
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-a-tm-1",
        "kind": "gate",
        "a": {
          "componentId": "ll-a",
          "portId": "tm"
        },
        "b": {
          "componentId": "tm-1",
          "portId": "ll"
        },
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "tm-1-pm-a",
        "kind": "gate",
        "a": {
          "componentId": "tm-1",
          "portId": "pm-a"
        },
        "b": {
          "componentId": "pm-a",
          "portId": "tm"
        },
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "tm-1-pm-b",
        "kind": "gate",
        "a": {
          "componentId": "tm-1",
          "portId": "pm-b"
        },
        "b": {
          "componentId": "pm-b",
          "portId": "tm"
        },
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      }
    ],
    "transferCapabilities": [
      {
        "id": "lp-slot-1-ll",
        "a": {
          "componentId": "lp-a",
          "holdingSiteId": "slot-1"
        },
        "b": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-1"
        },
        "handlerComponentId": "efem-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-slot-1-pm-a-station-1",
        "a": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-1"
        },
        "b": {
          "componentId": "pm-a",
          "holdingSiteId": "station-1"
        },
        "handlerComponentId": "tm-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-slot-1-pm-b-station-1",
        "a": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-1"
        },
        "b": {
          "componentId": "pm-b",
          "holdingSiteId": "station-1"
        },
        "handlerComponentId": "tm-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-slot-1-pm-b-station-2",
        "a": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-1"
        },
        "b": {
          "componentId": "pm-b",
          "holdingSiteId": "station-2"
        },
        "handlerComponentId": "tm-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "lp-slot-2-ll",
        "a": {
          "componentId": "lp-a",
          "holdingSiteId": "slot-2"
        },
        "b": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-2"
        },
        "handlerComponentId": "efem-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-slot-2-pm-a-station-1",
        "a": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-2"
        },
        "b": {
          "componentId": "pm-a",
          "holdingSiteId": "station-1"
        },
        "handlerComponentId": "tm-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-slot-2-pm-b-station-1",
        "a": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-2"
        },
        "b": {
          "componentId": "pm-b",
          "holdingSiteId": "station-1"
        },
        "handlerComponentId": "tm-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      },
      {
        "id": "ll-slot-2-pm-b-station-2",
        "a": {
          "componentId": "ll-a",
          "holdingSiteId": "slot-2"
        },
        "b": {
          "componentId": "pm-b",
          "holdingSiteId": "station-2"
        },
        "handlerComponentId": "tm-robot",
        "provenance": {
          "certainty": "assumed",
          "sourceEvidence": [
            "src-synthetic"
          ]
        }
      }
    ],
    "processRoutes": [
      {
        "id": "main-route",
        "label": "Representative flow, not replay evidence",
        "steps": [
          "lp-a",
          "ll-a",
          "pm-a",
          "ll-a",
          "lp-a"
        ]
      }
    ]
  }
];

export const bindings: BindingsFile = {
  "schemaVersion": "0.4",
  "equipmentId": "eq-synth-01",
  "bindings": [
    {
      "layoutId": "eq-synth-01-layout",
      "mappingHash": "sha256:30d2c1a312841e4cfb9d293107651d4125c0ea37806e473e564b03ff52bf8ca2",
      "effectiveFrom": "2026-01-01T09:00:00.000",
      "effectiveTo": "2026-01-01T10:04:30.000"
    },
    {
      "layoutId": "eq-synth-01-layout",
      "mappingHash": "sha256:0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef",
      "effectiveFrom": "2026-01-01T10:04:30.000"
    }
  ]
};

export const mappings: MappingVersion[] = [
  {
    "schemaVersion": "0.4",
    "equipmentId": "eq-synth-01",
    "layoutId": "eq-synth-01-layout",
    "entries": [
      {
        "alias": "EFEM_R1",
        "target": {
          "componentId": "efem-robot"
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "efem"
        }
      },
      {
        "alias": "LLA",
        "target": {
          "componentId": "ll-a",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "slot-1"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "slot-2"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "ll"
        }
      },
      {
        "alias": "LP1",
        "target": {
          "componentId": "lp-a",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "slot-1"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "slot-2"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "lp"
        }
      },
      {
        "alias": "PM1",
        "target": {
          "componentId": "pm-a"
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "pm-pattern"
        }
      },
      {
        "alias": "PM2",
        "target": {
          "componentId": "pm-b",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "station-1"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "station-2"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "pm-two"
        }
      },
      {
        "alias": "TM_R1",
        "target": {
          "componentId": "tm-robot",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "blade-a"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "blade-b"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "tm"
        }
      },
      {
        "alias": "VIRT_SCH",
        "target": {
          "ignore": true
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "ignore-virtual"
        }
      }
    ],
    "hash": "sha256:30d2c1a312841e4cfb9d293107651d4125c0ea37806e473e564b03ff52bf8ca2"
  },
  {
    "schemaVersion": "0.4",
    "equipmentId": "eq-synth-01",
    "layoutId": "eq-synth-01-layout",
    "entries": [
      {
        "alias": "EFEM_R1",
        "target": {
          "componentId": "efem-robot"
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "efem"
        }
      },
      {
        "alias": "LLA",
        "target": {
          "componentId": "ll-a",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "slot-1"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "slot-2"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "ll"
        }
      },
      {
        "alias": "LP1",
        "target": {
          "componentId": "lp-a",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "slot-1"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "slot-2"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "lp"
        }
      },
      {
        "alias": "PM1",
        "target": {
          "componentId": "pm-a"
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "pm-pattern"
        }
      },
      {
        "alias": "PM2",
        "target": {
          "componentId": "pm-b",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "station-1"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "station-2"
              }
            ]
          }
        },
        "certainty": "assumed",
        "rule": {
          "scope": {
            "level": "equipment",
            "equipmentId": "eq-synth-01"
          },
          "ruleId": "pm-two-assumed"
        }
      },
      {
        "alias": "TM_R1",
        "target": {
          "componentId": "tm-robot",
          "slots": {
            "offset": 0,
            "assign": [
              {
                "from": 1,
                "to": 1,
                "holdingSiteId": "blade-a"
              },
              {
                "from": 2,
                "to": 2,
                "holdingSiteId": "blade-b"
              }
            ]
          }
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "tm"
        }
      },
      {
        "alias": "VIRT_SCH",
        "target": {
          "ignore": true
        },
        "certainty": "verified",
        "rule": {
          "scope": {
            "level": "model",
            "maker": "synth-maker",
            "model": "synth-model"
          },
          "ruleId": "ignore-virtual"
        }
      }
    ],
    "hash": "sha256:0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef"
  }
];

export const batch: OccurrenceBatch = {
  "equipmentId": "eq-synth-01",
  "from": "2026-01-01T10:00:00.000",
  "to": "2026-01-01T10:30:00.000",
  "timeDomain": "site-synth",
  "watermark": {
    "seq": 59,
    "at": "2026-01-01T10:25:00.000"
  },
  "parserContractVersion": "synthetic-1",
  "dataGeneration": "g1",
  "occurrences": [
    {
      "id": "occ-carrier",
      "equipmentId": "eq-synth-01",
      "kind": "CARRIER_PRESENCE",
      "start": {
        "at": "2026-01-01T09:58:00.000",
        "seq": 1,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:24:00.000",
        "seq": 53,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LP1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "carrier",
        "id": "C01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-lp-slot-one",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T09:59:00.000",
        "seq": 2,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:01:00.000",
        "seq": 4,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LP1",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-lp-slot-two",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:00:00.000",
        "seq": 3,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:04:00.000",
        "seq": 10,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LP1",
        "slotAlias": "2"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W02",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      }
    },
    {
      "id": "occ-efem-out",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:01:00.000",
        "seq": 5,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:02:00.000",
        "seq": 6,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "EFEM_R1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      },
      "from": {
        "moduleAlias": "LP1",
        "slotAlias": "1"
      },
      "to": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      }
    },
    {
      "id": "occ-lla-arrival",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:02:00.000",
        "seq": 7,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:03:00.000",
        "seq": 8,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-tm-out",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:03:00.000",
        "seq": 9,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:06:00.000",
        "seq": 15,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "TM_R1",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      },
      "from": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      },
      "to": {
        "moduleAlias": "PM1"
      }
    },
    {
      "id": "occ-efem-overlap",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:04:00.000",
        "seq": 11,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:05:00.000",
        "seq": 12,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "EFEM_R1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W02",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      },
      "from": {
        "moduleAlias": "LP1",
        "slotAlias": "2"
      },
      "to": {
        "moduleAlias": "LLA",
        "slotAlias": "2"
      }
    },
    {
      "id": "occ-lla-slot-two",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:05:00.000",
        "seq": 13,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:06:00.000",
        "seq": 16,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LLA",
        "slotAlias": "2"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W02",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      }
    },
    {
      "id": "occ-tm-arm-two",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:05:00.000",
        "seq": 14,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:06:00.000",
        "seq": 17,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "TM_R1",
        "slotAlias": "2"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W03",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      },
      "from": {
        "moduleAlias": "PM2",
        "slotAlias": "2"
      },
      "to": {
        "moduleAlias": "LLA",
        "slotAlias": "2"
      }
    },
    {
      "id": "occ-pm1-process",
      "equipmentId": "eq-synth-01",
      "kind": "PROCESS",
      "start": {
        "at": "2026-01-01T10:06:00.000",
        "seq": 18,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:10:00.000",
        "seq": 22,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-pm2-slot-one",
      "equipmentId": "eq-synth-01",
      "kind": "PROCESS",
      "start": {
        "at": "2026-01-01T10:07:00.000",
        "seq": 19,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:09:00.000",
        "seq": 21,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM2",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W04",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-pm2-slot-two",
      "equipmentId": "eq-synth-01",
      "kind": "PROCESS",
      "start": {
        "at": "2026-01-01T10:08:00.000",
        "seq": 20,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:10:00.000",
        "seq": 23,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM2",
        "slotAlias": "2"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W05",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      }
    },
    {
      "id": "occ-tm-return",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:10:00.000",
        "seq": 24,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:11:00.000",
        "seq": 25,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "TM_R1",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      },
      "from": {
        "moduleAlias": "PM1"
      },
      "to": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      }
    },
    {
      "id": "occ-lla-return",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:11:00.000",
        "seq": 26,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:12:00.000",
        "seq": 27,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-efem-return",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:12:00.000",
        "seq": 28,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:13:00.000",
        "seq": 29,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "EFEM_R1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      },
      "from": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      },
      "to": {
        "moduleAlias": "LP1",
        "slotAlias": "1"
      }
    },
    {
      "id": "occ-lp-return",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:13:00.000",
        "seq": 30,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:24:00.000",
        "seq": 54,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LP1",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W01",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-forced",
      "equipmentId": "eq-synth-01",
      "kind": "POST_PROCESS",
      "start": {
        "at": "2026-01-01T10:13:00.000",
        "seq": 31,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:14:00.000",
        "seq": 32,
        "evidence": "derived",
        "reason": "ForcedByNextStart"
      },
      "location": {
        "moduleAlias": "PM1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      }
    },
    {
      "id": "occ-fallback",
      "equipmentId": "eq-synth-01",
      "kind": "FUNCTION",
      "start": {
        "at": "2026-01-01T10:14:00.000",
        "seq": 33,
        "evidence": "derived",
        "reason": "FallbackTime"
      },
      "end": {
        "at": "2026-01-01T10:15:00.000",
        "seq": 34,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      }
    },
    {
      "id": "occ-relocation",
      "equipmentId": "eq-synth-01",
      "kind": "TRANSFER",
      "start": {
        "at": "2026-01-01T10:15:00.000",
        "seq": 35,
        "evidence": "derived"
      },
      "end": {
        "at": "2026-01-01T10:16:00.000",
        "seq": 36,
        "evidence": "derived"
      },
      "location": {
        "moduleAlias": "TM_R1",
        "slotAlias": "1"
      },
      "synthetic": true,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W06",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      },
      "from": {
        "moduleAlias": "LLA",
        "slotAlias": "2"
      },
      "to": {
        "moduleAlias": "PM2",
        "slotAlias": "1"
      }
    },
    {
      "id": "occ-inferred",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:16:00.000",
        "seq": 37,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:17:00.000",
        "seq": 38,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM2",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W06",
        "identityEvidence": "derived",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-identity-empty",
      "equipmentId": "eq-synth-01",
      "kind": "FUNCTION",
      "start": {
        "at": "2026-01-01T10:17:00.000",
        "seq": 39,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:18:00.000",
        "seq": 40,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": null,
        "identityEvidence": "unknown",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-identity-unknown",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:18:00.000",
        "seq": 41,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:19:00.000",
        "seq": 42,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM2",
        "slotAlias": "2"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": null,
        "identityEvidence": "unknown",
        "lotId": "LOT-B"
      }
    },
    {
      "id": "occ-time-anomaly",
      "equipmentId": "eq-synth-01",
      "kind": "PROCESS",
      "start": {
        "at": "2026-01-01T10:20:00.000",
        "seq": 43,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:19:00.000",
        "seq": 44,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W07",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-null-time",
      "equipmentId": "eq-synth-01",
      "kind": "FUNCTION",
      "start": {
        "at": null,
        "seq": 45,
        "evidence": "unknown",
        "reason": "TimeParseFailure"
      },
      "end": {
        "at": "2026-01-01T10:21:00.000",
        "seq": 47,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM2"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      }
    },
    {
      "id": "occ-lla-conflict-one",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:21:00.000",
        "seq": 48,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:23:00.000",
        "seq": 50,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W08",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-lla-conflict-two",
      "equipmentId": "eq-synth-01",
      "kind": "VISIT",
      "start": {
        "at": "2026-01-01T10:22:00.000",
        "seq": 49,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:24:00.000",
        "seq": 55,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "LLA",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W09",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      }
    },
    {
      "id": "occ-unmapped",
      "equipmentId": "eq-synth-01",
      "kind": "PROCESS",
      "start": {
        "at": "2026-01-01T10:23:00.000",
        "seq": 51,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:24:00.000",
        "seq": 56,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "PM9"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W10",
        "identityEvidence": "observed",
        "lotId": "LOT-A"
      }
    },
    {
      "id": "occ-ignored",
      "equipmentId": "eq-synth-01",
      "kind": "FUNCTION",
      "start": {
        "at": "2026-01-01T10:22:30.000",
        "seq": 52,
        "evidence": "observed"
      },
      "end": {
        "at": "2026-01-01T10:24:00.000",
        "seq": 57,
        "evidence": "observed"
      },
      "location": {
        "moduleAlias": "VIRT_SCH"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      }
    },
    {
      "id": "occ-open",
      "equipmentId": "eq-synth-01",
      "kind": "PROCESS",
      "start": {
        "at": "2026-01-01T10:24:00.000",
        "seq": 58,
        "evidence": "observed"
      },
      "end": null,
      "location": {
        "moduleAlias": "PM2",
        "slotAlias": "1"
      },
      "synthetic": false,
      "source": {
        "parserContractVersion": "synthetic-1",
        "dataGeneration": "g1"
      },
      "material": {
        "kind": "wafer",
        "id": "W11",
        "identityEvidence": "observed",
        "lotId": "LOT-B"
      }
    }
  ],
  "issues": [
    {
      "id": "dqi-end-before-start",
      "equipmentId": "eq-synth-01",
      "issueType": "EndBeforeStart",
      "seq": 46,
      "at": "2026-01-01T10:20:00.000",
      "relatedOccurrenceId": "occ-time-anomaly"
    },
    {
      "id": "dqi-unmatched-end",
      "equipmentId": "eq-synth-01",
      "issueType": "UnmatchedEnd",
      "seq": 59,
      "at": "2026-01-01T10:25:00.000"
    }
  ]
};
